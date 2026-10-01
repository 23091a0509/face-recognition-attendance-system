"""
Automated Test Runner (Zero external test runner dependencies)
Runs all test functions across tests/ and asserts integrity.
"""

import sys
import os
import inspect
import traceback

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

def run_all_tests():
    print("=" * 70)
    print("BIOMETRIC ATTENDANCE SYSTEM - AUTOMATED TEST SUITE")
    print("=" * 70)

    test_modules = [
        "tests.test_normalization",
        "tests.test_quality",
        "tests.test_matcher",
        "tests.test_database_uniqueness",
        "tests.test_auth_rbac",
        "tests.test_session_attendance_rules",
        "tests.test_ip_geofencing",
        "tests.test_temporal",
        "tests.test_integration",
    ]

    total_run = 0
    passed = 0
    failed = 0

    for mod_name in test_modules:
        try:
            mod = __import__(mod_name, fromlist=["*"])
        except Exception as e:
            print(f"[FAIL] Error importing {mod_name}: {e}")
            traceback.print_exc()
            failed += 1
            continue

        test_funcs = [
            (name, func) for name, func in inspect.getmembers(mod, inspect.isfunction)
            if name.startswith("test_")
        ]

        print(f"\nRunning {mod_name} ({len(test_funcs)} tests):")

        for name, func in test_funcs:
            total_run += 1
            try:
                func()
                print(f"  [PASS] {name}")
                passed += 1
            except Exception as e:
                print(f"  [FAIL] {name}: {e}")
                traceback.print_exc()
                failed += 1

    print("\n" + "=" * 70)
    print(f"TEST SUMMARY: Total={total_run} | Passed={passed} | Failed={failed}")
    print("=" * 70)

    if failed > 0:
        sys.exit(1)

if __name__ == "__main__":
    run_all_tests()
