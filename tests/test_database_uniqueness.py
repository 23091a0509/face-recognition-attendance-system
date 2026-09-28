import pytest
import sqlite3
from backend.database import get_connection

def test_attendance_uniqueness_constraint():
    conn = get_connection()
    cursor = conn.cursor()
    
    test_sid = "TEST_UNIQUE_999"
    test_date = "2026-09-28"
    
    # Clean any leftover
    cursor.execute("DELETE FROM attendance WHERE student_id = ? AND date = ?", (test_sid, test_date))
    conn.commit()
    
    # First insert: must succeed
    cursor.execute(
        "INSERT INTO attendance (student_id, date, time, method, confidence) VALUES (?, ?, '10:00:00', 'manual', 100.0)",
        (test_sid, test_date)
    )
    conn.commit()
    
    # Second insert with identical student_id and date: must raise IntegrityError
    with pytest.raises(sqlite3.IntegrityError):
        cursor.execute(
            "INSERT INTO attendance (student_id, date, time, method, confidence) VALUES (?, ?, '10:05:00', 'manual', 100.0)",
            (test_sid, test_date)
        )
        conn.commit()
        
    # Clean up test row
    cursor.execute("DELETE FROM attendance WHERE student_id = ? AND date = ?", (test_sid, test_date))
    conn.commit()
    conn.close()

def test_foreign_keys_pragma_enabled():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("PRAGMA foreign_keys")
    fk_enabled = cursor.fetchone()[0]
    conn.close()
    assert fk_enabled == 1
