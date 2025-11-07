"""Test execution utility used by the agent."""

from __future__ import annotations

import subprocess
from dataclasses import dataclass
from typing import List


@dataclass
class RunResult:
    command: List[str]
    returncode: int
    stdout: str
    stderr: str

    @property
    def ok(self) -> bool:
        return self.returncode == 0

    def format(self) -> str:
        status = "PASSED" if self.ok else "FAILED"
        return f"Command {' '.join(self.command)} {status}\nstdout:\n{self.stdout}\nstderr:\n{self.stderr}"


def run_tests(command: List[str]) -> RunResult:
    process = subprocess.run(command, capture_output=True, text=True, check=False)
    return RunResult(command=command, returncode=process.returncode, stdout=process.stdout, stderr=process.stderr)
