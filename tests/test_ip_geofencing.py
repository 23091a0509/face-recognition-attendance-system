import pytest
from backend_api.routers.admin import is_ip_allowed, get_client_ip
from backend.database import get_system_config, set_system_config

def test_is_ip_allowed_single_ip():
    allowed = "192.168.1.50, 10.0.0.1"
    assert is_ip_allowed("192.168.1.50", allowed) is True
    assert is_ip_allowed("10.0.0.1", allowed) is True
    assert is_ip_allowed("192.168.1.51", allowed) is False
    assert is_ip_allowed("172.16.0.1", allowed) is False

def test_is_ip_allowed_cidr_blocks():
    allowed = "192.168.1.0/24\n10.0.0.0/8\n127.0.0.1"
    assert is_ip_allowed("192.168.1.15", allowed) is True
    assert is_ip_allowed("192.168.1.254", allowed) is True
    assert is_ip_allowed("192.168.2.1", allowed) is False
    assert is_ip_allowed("10.250.1.1", allowed) is True
    assert is_ip_allowed("127.0.0.1", allowed) is True
    assert is_ip_allowed("8.8.8.8", allowed) is False

def test_is_ip_allowed_empty_allows_all():
    assert is_ip_allowed("192.168.1.1", "") is True
    assert is_ip_allowed("8.8.8.8", "   ") is True

def test_is_ip_allowed_ipv6_and_dual_stack():
    allowed = "192.168.1.0/24\n2001:db8::/32\n::1"
    # IPv6 loopback
    assert is_ip_allowed("::1", allowed) is True
    # IPv6 within subnet
    assert is_ip_allowed("2001:db8::abcd", allowed) is True
    # IPv6 outside subnet
    assert is_ip_allowed("2001:dead:beef::1", allowed) is False
    # IPv4 within subnet
    assert is_ip_allowed("192.168.1.42", allowed) is True
    # IPv4 outside subnet
    assert is_ip_allowed("10.0.0.1", allowed) is False

def test_is_ip_allowed_port_stripping():
    allowed = "192.168.1.50, ::1"
    assert is_ip_allowed("192.168.1.50:8000", allowed) is True
    assert is_ip_allowed("[::1]:54321", allowed) is True
    assert is_ip_allowed("192.168.1.51:8000", allowed) is False

def test_is_ip_allowed_malformed_inputs_graceful():
    assert is_ip_allowed("not_an_ip", "192.168.1.1") is False
    assert is_ip_allowed("192.168.1.1", "invalid/cidr, 192.168.1.1") is True

def test_system_config_persistence():
    set_system_config("test_ip_flag", "true")
    assert get_system_config("test_ip_flag") == "true"
    set_system_config("test_ip_flag", "false")
    assert get_system_config("test_ip_flag") == "false"

def test_is_attendance_late_dynamic_cutoff():
    from backend_api.config import is_attendance_late
    # Default 09:15 cutoff
    assert is_attendance_late("09:10:00") is False
    assert is_attendance_late("09:15:00") is False
    assert is_attendance_late("09:16:00") is True
    assert is_attendance_late("10:00:00") is True

    # Custom dynamic cutoff set by admin (e.g. 08:30)
    assert is_attendance_late("08:25:00", late_after="08:30") is False
    assert is_attendance_late("08:35:00", late_after="08:30") is True

    # Custom dynamic cutoff set by admin (e.g. 10:00)
    assert is_attendance_late("09:45:00", late_after="10:00") is False
    assert is_attendance_late("10:05:00", late_after="10:00") is True

def test_admin_threshold_and_ip_settings_persistence():
    # Test setting and reading back biometric thresholds and IP settings
    set_system_config("face_threshold", "0.78")
    set_system_config("min_margin", "0.10")
    set_system_config("ip_restriction_enabled", "true")
    set_system_config("allowed_ips", "192.168.1.0/24, 10.0.0.1")

    assert float(get_system_config("face_threshold")) == 0.78
    assert float(get_system_config("min_margin")) == 0.10
    assert get_system_config("ip_restriction_enabled") == "true"
    assert "192.168.1.0/24" in get_system_config("allowed_ips")

    # Reset back to standard defaults
    set_system_config("face_threshold", "0.75")
    set_system_config("min_margin", "0.08")
    set_system_config("ip_restriction_enabled", "false")
    set_system_config("allowed_ips", "127.0.0.1, ::1, 192.168.0.0/16, 10.0.0.0/8")

