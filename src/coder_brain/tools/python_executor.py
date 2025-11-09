"""Utilities for executing python snippets on behalf of the agent."""

from __future__ import annotations

import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Optional


@dataclass
class PythonRunResult:
    """Represents the outcome of running a python snippet."""

    code: str
    returncode: int
    stdout: str
    stderr: str
    timed_out: bool = False

    @property
    def ok(self) -> bool:
        return self.returncode == 0 and not self.timed_out

    def format(self) -> str:
        status = "PASSED" if self.ok else "FAILED"
        if self.timed_out:
            status = "TIMEOUT"
        header = f"Python snippet {status}"
        return (
            f"{header}\n"
            f"code:\n{self.code}\n"
            f"stdout:\n{self.stdout}\n"
            f"stderr:\n{self.stderr}"
        )


def run_python(code: str, *, cwd: Optional[Path] = None, timeout: int = 30) -> PythonRunResult:
    """Execute ``code`` using the current python interpreter."""

    try:
        completed = subprocess.run(
            [sys.executable, "-c", code],
            capture_output=True,
            text=True,
            cwd=str(cwd) if cwd is not None else None,
            timeout=timeout,
            check=False,
        )
        return PythonRunResult(
            code=code,
            returncode=completed.returncode,
            stdout=completed.stdout,
            stderr=completed.stderr,
        )
    except subprocess.TimeoutExpired as exc:
        return PythonRunResult(
            code=code,
            returncode=-1,
            stdout=exc.stdout or "",
            stderr=exc.stderr or "Execution timed out.",
            timed_out=True,
        )
