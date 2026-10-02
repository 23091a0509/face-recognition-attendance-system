from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import OAuth2PasswordBearer
import bcrypt
from jose import jwt, JWTError, ExpiredSignatureError
from datetime import datetime, timedelta, timezone
from fastapi.security import OAuth2PasswordRequestForm
from fastapi import status
from pydantic import BaseModel
import os
from dotenv import load_dotenv

load_dotenv()  # loads .env from project root (ignored by git)

router = APIRouter(prefix="/auth", tags=["Auth"])

from backend_api.config import JWT_SECRET_KEY, SERVICE_API_KEY

SECRET_KEY = JWT_SECRET_KEY
ALGORITHM = "HS256"

from backend.database import get_connection

def hash_password(plain_password: str) -> str:
    """Hash a password using bcrypt with standard 12 salt rounds, safely truncated to 72 bytes."""
    if not plain_password:
        raise ValueError("Password cannot be empty")
    pwd_bytes = plain_password.encode("utf-8")[:72]
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pwd_bytes, salt).decode("utf-8")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain password against a bcrypt hash."""
    if not plain_password or not hashed_password:
        return False
    try:
        pwd_bytes = plain_password.encode("utf-8")[:72]
        hash_bytes = hashed_password.encode("utf-8")
        return bcrypt.checkpw(pwd_bytes, hash_bytes)
    except Exception:
        return False

class PasswordContext:
    @staticmethod
    def hash(secret: str) -> str:
        return hash_password(secret)

    @staticmethod
    def verify(secret: str, hashed: str) -> bool:
        return verify_password(secret, hashed)

pwd_context = PasswordContext()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

def create_token(student_id: str):
    payload = {
        "sub": student_id,
        "role": "admin" if student_id == "admin" else "student",
        "exp": datetime.now(timezone.utc) + timedelta(hours=8)
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    """Decode and validate a JWT access token, returning the payload dictionary."""
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])


@router.post("/login")
async def login(request: Request):
    student_id = None
    password = None

    # 1. Attempt form data parsing
    try:
        form = await request.form()
        if form:
            student_id = form.get("username")
            password = form.get("password")
    except Exception:
        pass

    # 2. Attempt JSON payload parsing if form data did not supply credentials
    if not student_id or not password:
        try:
            body = await request.json()
            if body:
                student_id = body.get("username") or body.get("identifier") or body.get("student_id")
                password = body.get("password")
        except Exception:
            pass

    if not student_id or not password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username and password are required"
        )

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT password FROM students WHERE student_id = ?", (student_id,))
    row = cursor.fetchone()
    conn.close()

    if not row:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials"
        )

    if not verify_password(password, row[0]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials"
        )

    return {
        "access_token": create_token(student_id),
        "token_type": "bearer"
    }


class RegisterRequest(BaseModel):
    student_id: str
    name: str
    department: str
    password: str

@router.post("/register")
def register(data: RegisterRequest):
    student_id = data.student_id.strip()
    name = data.name.strip()
    department = data.department.strip()
    password = data.password

    if not student_id or not name or not department or not password:
        raise HTTPException(status_code=400, detail="All fields (student_id, name, department, password) are required")

    conn = get_connection()
    cursor = conn.cursor()
    
    # Check if user already exists
    cursor.execute("SELECT 1 FROM students WHERE student_id = ?", (student_id,))
    if cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=400, detail="Student ID already registered")

    cursor.execute(
        "INSERT INTO students (student_id, name, department, password) VALUES (?, ?, ?, ?)",
        (student_id, name, department, pwd_context.hash(password))
    )
    conn.commit()
    conn.close()
    return {"message": "User registered successfully"}

def get_current_user(request: Request):
    # 1. Check for X-API-KEY authentication (Task Group 4)
    api_key = request.headers.get("X-API-KEY")
    if api_key:
        if api_key == SERVICE_API_KEY:
            return {"student_id": "service_client", "role": "admin"}
        else:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Invalid Service API Key"
            )

    # 2. Check for standard JWT token authentication
    authorization: str = request.headers.get("Authorization")
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    token = authorization.split(" ")[1]
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        student_id: str = payload.get("sub")
        if student_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token: missing subject",
                headers={"WWW-Authenticate": "Bearer"},
            )
        role: str = payload.get("role", "student")
        return {"student_id": student_id, "role": role}
    except ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
            headers={"WWW-Authenticate": "Bearer"},
        )

def require_admin(user: dict = Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Admin access required"
        )
    return user

@router.get("/me")
def me(user: dict = Depends(get_current_user)):
    student_id = user["student_id"]
    role = user["role"]

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT name, department, photo_url, year, email FROM students WHERE student_id = ?", (student_id,))
    row = cursor.fetchone()
    conn.close()

    name = row[0] if (row and row[0]) else ("Administrator" if role == "admin" else student_id)
    department = row[1] if (row and row[1]) else ("Administration" if role == "admin" else "General")
    photo_url = row[2] if (row and row[2]) else None
    year = row[3] if (row and row[3]) else None
    email = row[4] if (row and row[4]) else (f"{student_id.lower()}@institution.edu" if role == "student" else "admin@institution.edu")

    return {
        "student_id": student_id,
        "role": role,
        "name": name,
        "department": department,
        "photo_url": photo_url,
        "year": year,
        "email": email,
    }
