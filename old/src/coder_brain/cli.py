"""Command line entry-point for the coder-brain agent prototype."""

from __future__ import annotations

import argparse
from pathlib import Path

from .agent import CoderBrainAgent, Task
from .llm import LLMConfig


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run the coder-brain agent on a project")
    parser.add_argument("--root", type=Path, required=True, help="Path to the project root")
    parser.add_argument("--task", type=str, required=True, help="Description of the task to perform")
    parser.add_argument(
        "--keywords",
        type=str,
        nargs=argparse.ZERO_OR_MORE,
        help="Optional keywords to guide file selection and auto-search",
    )
    parser.add_argument("--test", type=str, nargs=argparse.ZERO_OR_MORE, help="Optional test command to run")
    parser.add_argument("--search", type=str, default="", help="Optional pattern to search in selected files")
    parser.add_argument(
        "--auto-search",
        action="store_true",
        help="If no explicit search pattern is provided, search for the first derived keyword",
    )
    parser.add_argument("--llm-provider", type=str, help="LLM provider identifier (e.g. mock, openai)")
    parser.add_argument("--llm-model", type=str, help="LLM model name to use")
    parser.add_argument(
        "--llm-max-tokens",
        type=int,
        default=1024,
        help="Maximum number of tokens to request from the LLM",
    )
    parser.add_argument(
        "--llm-temperature",
        type=float,
        default=0.2,
        help="Sampling temperature for the LLM",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if not args.root.exists():
        parser.error(f"Root path does not exist: {args.root}")
    if not args.root.is_dir():
        parser.error(f"Root path is not a directory: {args.root}")

    llm_config = None
    if args.llm_provider or args.llm_model:
        if not (args.llm_provider and args.llm_model):
            parser.error("Both --llm-provider and --llm-model must be provided together")
        llm_config = LLMConfig(
            provider=args.llm_provider,
            model=args.llm_model,
            max_tokens=args.llm_max_tokens,
            temperature=args.llm_temperature,
        )

    agent = CoderBrainAgent(args.root, llm_config=llm_config)
    task = Task(
        description=args.task,
        keywords=args.keywords or [],
        test_command=args.test or None,
    )
    report = agent.perform_task(
        task,
        search_pattern=args.search or None,
        auto_search=args.auto_search,
    )

    print(report)
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
