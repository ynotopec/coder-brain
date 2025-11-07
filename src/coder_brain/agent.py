"""Agent orchestration logic inspired by the description in ``buffer.md``."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable, List, Optional

from .indexer import ProjectIndexer
from .memory import FileContext, LongTermMemory, WorkingMemory
from .tools.search import search_files, search_index
from .tools.test_runner import run_tests, RunResult


@dataclass
class Task:
    """Represents a unit of work for the agent."""

    description: str
    keywords: List[str] = field(default_factory=list)
    test_command: Optional[List[str]] = None

    def derive_keywords(self) -> List[str]:
        if self.keywords:
            return self.keywords
        tokens = [word.strip(",.()") for word in self.description.split()]
        return [token for token in tokens if len(token) > 3]


@dataclass
class PlanStep:
    """Single reasoning step produced by the agent."""

    summary: str
    details: str

    def format(self) -> str:
        return f"{self.summary}\n{self.details}"


class CoderBrainAgent:
    """High level orchestration for the developer agent prototype."""

    def __init__(
        self,
        root: Path,
        working_memory: Optional[WorkingMemory] = None,
        long_term_memory: Optional[LongTermMemory] = None,
    ) -> None:
        self.root = root
        self.indexer = ProjectIndexer(root)
        self.working_memory = working_memory or WorkingMemory()
        self.long_term_memory = long_term_memory or LongTermMemory()
        self.plan: List[PlanStep] = []

    def bootstrap(self) -> None:
        """Initial scan replicating the human ability to build a mental map."""

        self.plan.clear()
        self.indexer.scan()
        for path, indexed in self.indexer.files.items():
            first_line = indexed.preview.splitlines()[0] if indexed.preview else ""
            summary = first_line or f"{path.name} ({indexed.size} bytes)"
            self.long_term_memory.add_summary(path, summary)
        self.plan.append(
            PlanStep(
                summary="Indexed project",
                details=self.indexer.describe(),
            )
        )

    def _select_relevant_files(self, task: Task, limit: int = 5) -> List[Path]:
        keywords = task.derive_keywords()
        scored: List[tuple[int, Path]] = []
        for path, summary in self.long_term_memory.file_summaries.items():
            score = sum(1 for keyword in keywords if keyword.lower() in summary.lower())
            if score:
                scored.append((score, path))
        scored.sort(key=lambda item: (-item[0], str(item[1])))
        return [path for _, path in scored[:limit]]

    def _load_working_memory(self, paths: Iterable[Path]) -> None:
        contexts = []
        for path in paths:
            summary = self.long_term_memory.summarize(path) or path.name
            contexts.append(FileContext(path=path, summary=summary))
        self.working_memory.reset()
        self.working_memory.load(contexts)

    def create_plan(self, task: Task) -> None:
        """Produce high level steps for the task."""

        relevant = self._select_relevant_files(task)
        self._load_working_memory(relevant)
        details = ["Working memory window:", self.working_memory.to_bullet_list() or "(empty)"]
        if relevant:
            searches = []
            for keyword in task.derive_keywords()[:3]:
                summaries = search_index(self.indexer, keyword)
                if summaries:
                    searches.append(f"Keyword '{keyword}' => {summaries}")
            if searches:
                details.append("Search results:")
                details.extend(f"  {item}" for item in searches)
        self.plan.append(
            PlanStep(
                summary=f"Prepared plan for task: {task.description}",
                details="\n".join(details),
            )
        )

    def inspect_code(self, pattern: str) -> List[str]:
        """Return formatted lines matching pattern inside current working files."""

        files = [ctx.path for ctx in self.working_memory]
        results = search_files(pattern, files)
        formatted = [result.format() for result in results]
        self.plan.append(
            PlanStep(
                summary=f"Ran code search for pattern '{pattern}'",
                details="\n".join(formatted) if formatted else "No matches",
            )
        )
        return formatted

    def run_task_tests(self, task: Task) -> Optional[RunResult]:
        if not task.test_command:
            return None
        result = run_tests(task.test_command)
        self.plan.append(
            PlanStep(
                summary="Executed test command",
                details=result.format(),
            )
        )
        return result

    def report(self) -> str:
        """Return a human readable report of the agent activity."""

        sections = [step.format() for step in self.plan]
        return "\n\n".join(sections)
