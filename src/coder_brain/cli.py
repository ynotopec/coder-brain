"""Command line entry-point for the coder-brain agent prototype."""

from __future__ import annotations

import argparse
from pathlib import Path

from .agent import CoderBrainAgent, Task


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run the coder-brain agent on a project")
    parser.add_argument("--root", type=Path, required=True, help="Path to the project root")
    parser.add_argument("--task", type=str, required=True, help="Description of the task to perform")
    parser.add_argument("--test", type=str, nargs=argparse.ZERO_OR_MORE, help="Optional test command to run")
    parser.add_argument("--search", type=str, default="", help="Optional pattern to search in selected files")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    agent = CoderBrainAgent(args.root)
    agent.bootstrap()

    task = Task(description=args.task, test_command=args.test or None)
    agent.create_plan(task)

    if args.search:
        agent.inspect_code(args.search)

    if args.test:
        agent.run_task_tests(task)

    print(agent.report())
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
