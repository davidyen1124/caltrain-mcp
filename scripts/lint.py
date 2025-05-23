#!/usr/bin/env python3
"""
Local development script to run all CI checks.
Run this before pushing to catch issues early.
"""

import os
import subprocess
import sys
from pathlib import Path


def run_command(cmd: list[str], description: str) -> bool:
    """Run a command and return True if successful."""
    print(f"\n🔍 {description}")
    print(f"Running: {' '.join(cmd)}")

    result = subprocess.run(cmd, capture_output=True, text=True)

    if result.returncode == 0:
        print(f"✅ {description} passed")
        if result.stdout.strip():
            print(result.stdout)
        return True
    else:
        print(f"❌ {description} failed")
        if result.stdout.strip():
            print("STDOUT:", result.stdout)
        if result.stderr.strip():
            print("STDERR:", result.stderr)
        return False


def main() -> int:
    """Run all checks and return exit code."""
    # Change to project root
    project_root = Path(__file__).parent.parent
    os.chdir(project_root)

    checks = [
        (["uv", "run", "ruff", "check", "."], "Ruff linting"),
        (["uv", "run", "ruff", "format", "--check", "."], "Ruff formatting"),
        (["uv", "run", "mypy", "src"], "MyPy type checking"),
        (
            [
                "uv",
                "run",
                "pytest",
                "--cov=src/caltrain_mcp",
                "--cov-report=term-missing",
            ],
            "Tests with coverage",
        ),
    ]

    print("🚀 Running all CI checks locally...")

    failed_checks = []
    for cmd, description in checks:
        if not run_command(cmd, description):
            failed_checks.append(description)

    if failed_checks:
        print(f"\n❌ {len(failed_checks)} check(s) failed:")
        for check in failed_checks:
            print(f"  - {check}")
        print("\nPlease fix the issues above before pushing.")
        return 1
    else:
        print("\n🎉 All checks passed! Ready to push.")
        return 0


if __name__ == "__main__":
    sys.exit(main())
