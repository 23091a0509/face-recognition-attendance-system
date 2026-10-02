import ipaddress
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from typing import Optional

from backend.database import get_system_config, set_system_config
from backend_api.routers.auth import require_admin, get_current_user

router = APIRouter(prefix="/admin", tags=["Admin Settings"])


def _clean_ip_string(ip_str: str) -> str:
    s = ip_str.strip()
    if s.startswith("[") and "]" in s:
        # Bracketed IPv6, e.g. [::1]:8080 or [::1]
        s = s[1:s.index("]")]
    elif ":" in s and s.count(":") == 1:
        # IPv4 with port, e.g. 192.168.1.50:8000
        s = s.split(":")[0].strip()
    return s


def get_client_ip(request: Request) -> str:
    """
    Extracts the client's public/LAN IP address inspecting proxy headers first:
    1. CF-Connecting-IP (Cloudflare on Render)
    2. X-Forwarded-For (first entry)
    3. X-Real-IP
    4. request.client.host
    """
    cf_ip = request.headers.get("CF-Connecting-IP")
    if cf_ip and cf_ip.strip():
        return _clean_ip_string(cf_ip.strip())

    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        first_ip = forwarded.split(",")[0].strip()
        if first_ip:
            return _clean_ip_string(first_ip)

    real_ip = request.headers.get("X-Real-IP")
    if real_ip and real_ip.strip():
        return _clean_ip_string(real_ip.strip())

    if request.client and request.client.host:
        return _clean_ip_string(request.client.host.strip())

    return "127.0.0.1"


def is_ip_allowed(client_ip: str, allowed_ips_str: str) -> bool:
    """
    Checks if client_ip is contained in the allowed list of IPs or CIDR subnets.
    Supports IPv4, IPv6, and IPv4-mapped IPv6 addresses, safely skipping version mismatches.
    """
    if not allowed_ips_str or not allowed_ips_str.strip() or allowed_ips_str.strip() in ("*", "0.0.0.0/0", "all"):
        return True

    clean_client = _clean_ip_string(client_ip)
    try:
        client_addr = ipaddress.ip_address(clean_client)
        # Normalize IPv4-mapped IPv6 address (e.g. ::ffff:192.168.1.1 -> 192.168.1.1)
        if isinstance(client_addr, ipaddress.IPv6Address) and client_addr.ipv4_mapped:
            client_addr = client_addr.ipv4_mapped
    except ValueError:
        return False

    raw_items = [
        item.strip()
        for item in allowed_ips_str.replace(",", "\n").splitlines()
        if item.strip()
    ]

    for raw_item in raw_items:
        clean_item = _clean_ip_string(raw_item)
        try:
            if "/" in clean_item:
                net = ipaddress.ip_network(clean_item, strict=False)
                if client_addr.version != net.version:
                    continue
                if client_addr in net:
                    return True
            else:
                target_addr = ipaddress.ip_address(clean_item)
                if isinstance(target_addr, ipaddress.IPv6Address) and target_addr.ipv4_mapped:
                    target_addr = target_addr.ipv4_mapped
                if client_addr == target_addr:
                    return True
        except (ValueError, TypeError):
            continue

    return False


def verify_campus_ip(request: Request):
    """
    FastAPI dependency that enforces network geofencing on attendance endpoints.
    If ip_restriction_enabled is true and caller IP is not whitelisted, raises 403.
    Admins are always exempt from IP restriction.
    """
    is_enabled_raw = get_system_config("ip_restriction_enabled", "false")
    is_enabled = str(is_enabled_raw).strip().lower() in ("true", "1", "yes", "on")

    if not is_enabled:
        return

    # 1. Exempt Administrators from network geofencing
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        try:
            from backend_api.routers.auth import decode_token
            payload = decode_token(auth_header.split(" ")[1])
            if payload.get("role") == "admin":
                return
        except Exception:
            pass

    allowed_ips = get_system_config("allowed_ips", "")
    if not allowed_ips or allowed_ips.strip() in ("", "*", "0.0.0.0/0", "all"):
        return

    client_ip = get_client_ip(request)

    if not is_ip_allowed(client_ip, allowed_ips):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access Denied: Your IP address ({client_ip}) is not on the authorized campus network whitelist. Please connect to authorized campus Wi-Fi."
        )


class SettingsPayload(BaseModel):
    ip_restriction_enabled: bool = False
    allowed_ips: str = ""
    face_threshold: Optional[float] = 0.75
    min_margin: Optional[float] = 0.08
    duplicate_protection: Optional[bool] = True
    duplicate_window_minutes: Optional[int] = 5
    late_after_time: Optional[str] = "09:15"


@router.get("/settings")
def get_settings(request: Request, current_user: dict = Depends(require_admin)):
    """
    Fetches system settings including IP restriction, AI parameters, and caller IP.
    """
    client_ip = get_client_ip(request)
    ip_enabled_raw = get_system_config("ip_restriction_enabled", "false")
    ip_enabled = str(ip_enabled_raw).strip().lower() in ("true", "1", "yes", "on")
    allowed_ips = get_system_config("allowed_ips", "127.0.0.1, ::1, 192.168.0.0/16, 10.0.0.0/8")
    face_threshold = float(get_system_config("face_threshold", "0.75"))
    min_margin = float(get_system_config("min_margin", "0.08"))
    dup_prot_raw = get_system_config("duplicate_protection", "true")
    dup_prot = str(dup_prot_raw).strip().lower() in ("true", "1", "yes", "on")
    dup_win = int(get_system_config("duplicate_window_minutes", "5"))
    late_time = get_system_config("late_after_time", "09:15")

    return {
        "ip_restriction_enabled": ip_enabled,
        "allowed_ips": allowed_ips,
        "client_ip": client_ip,
        "face_threshold": face_threshold,
        "min_margin": min_margin,
        "duplicate_protection": dup_prot,
        "duplicate_window_minutes": dup_win,
        "late_after_time": late_time,
    }


@router.post("/settings")
def save_settings(data: SettingsPayload, request: Request, current_user: dict = Depends(require_admin)):
    """
    Updates system settings in system_config table.
    """
    set_system_config("ip_restriction_enabled", "true" if data.ip_restriction_enabled else "false")
    set_system_config("allowed_ips", data.allowed_ips.strip())
    if data.face_threshold is not None:
        set_system_config("face_threshold", str(data.face_threshold))
    if data.min_margin is not None:
        set_system_config("min_margin", str(data.min_margin))
    if data.duplicate_protection is not None:
        set_system_config("duplicate_protection", "true" if data.duplicate_protection else "false")
    if data.duplicate_window_minutes is not None:
        set_system_config("duplicate_window_minutes", str(data.duplicate_window_minutes))
    if data.late_after_time is not None:
        set_system_config("late_after_time", str(data.late_after_time))

    return {
        "success": True,
        "message": "Settings updated successfully",
        "settings": {
            "ip_restriction_enabled": data.ip_restriction_enabled,
            "allowed_ips": data.allowed_ips,
            "face_threshold": data.face_threshold,
            "min_margin": data.min_margin,
            "duplicate_protection": data.duplicate_protection,
            "duplicate_window_minutes": data.duplicate_window_minutes,
            "late_after_time": data.late_after_time,
        }
    }
