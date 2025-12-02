"""Agent orchestration logic inspired by the description in ``buffer.md``."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, Iterable, List, Optional

from .indexer import ProjectIndexer
from .memory import FileContext, LongTermMemory, WorkingMemory
from .tools.search import search_files, search_index
from .tools.test_runner import run_tests, RunResult
from .llm import LanguageModel, LLMConfig, create_language_model


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
        *,
        language_model: Optional[LanguageModel] = None,
        llm_config: Optional[LLMConfig] = None,
    ) -> None:
        self.root = root
        self.indexer = ProjectIndexer(root)
        self.working_memory = working_memory or WorkingMemory()
        self.long_term_memory = long_term_memory or LongTermMemory()
        self.language_model = language_model or create_language_model(llm_config)
        self.plan: List[PlanStep] = []
        self.module_map: Dict[Path, List[Path]] = {}

    def bootstrap(self) -> None:
        """Initial scan replicating the human ability to build a mental map."""

        self.plan.clear()
        self.indexer.scan()
        self._summarize_project()
        self.plan.append(
            PlanStep(
                summary="Indexed project",
                details=self.indexer.describe(),
            )
        )

    def _summarize_project(self) -> None:
        module_files: Dict[Path, List[Path]] = {}
        for path, indexed in self.indexer.files.items():
            module_files.setdefault(path.parent, []).append(path)
            summary = self.language_model.summarize(
                instructions=(
                    "You summarise a code file for later retrieval. "
                    "Produce a single concise sentence mentioning the main responsibility and key symbols."
                ),
                text=f"Path: {path}\nPreview:\n{indexed.preview or '(empty file)'}",
            )
            self.long_term_memory.add_summary(path, summary.strip())

        self.module_map = module_files
        for module_path, files in module_files.items():
            summaries = [
                self.long_term_memory.summarize(file) or file.name for file in files
            ]
            module_summary = self.language_model.summarize(
                instructions=(
                    "You are an architecture assistant."
                    "Combine the following file summaries into a short module level description"
                    " highlighting the service or domain."
                ),
                text=f"Module: {module_path}\n" + "\n".join(summaries),
            )
            self.long_term_memory.add_module_summary(module_path, module_summary.strip())

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

        module_context = []
        for path in relevant:
            module_summary = self.long_term_memory.summarize_module(path.parent)
            file_summary = self.long_term_memory.summarize(path)
            if module_summary:
                module_context.append(f"Module {path.parent}: {module_summary}")
            if file_summary:
                module_context.append(f"File {path.name}: {file_summary}")
        plan_instructions = (
            "You are planning how to modify a code base."
            "Write 3 to 5 bullet points describing concrete actions referencing files when possible."
            "Finish with a test or validation step if applicable."
        )
        context_text = (
            f"Task: {task.description}\n" + "\n".join(module_context)
            if module_context
            else f"Task: {task.description}\n(no context available)"
        )
        llm_plan = self.language_model.plan(
            instructions=plan_instructions,
            context=context_text,
        )
        self.plan.append(
            PlanStep(
                summary="LLM-generated plan",
                details=llm_plan,
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

    def perform_task(
        self,
        task: Task,
        *,
        search_pattern: Optional[str] = None,
        refresh_index: bool = True,
    ) -> str:
        """Execute the full pipeline for a task from indexing to validation.

        The method mirrors a human operator performing an end-to-end iteration:

        1. Optionally rebuild the project map (index + summaries).
        2. Build a plan aligned with the task description and long-term memory.
        3. Inspect relevant code for the provided search pattern.
        4. Execute the declared test command.
        5. Return a consolidated report ready to share with a teammate.
        """

        if refresh_index or not self.indexer.files:
            self.bootstrap()
        else:
            self.plan.clear()

        self.create_plan(task)

        if search_pattern:
            self.inspect_code(search_pattern)

        if task.test_command:
            self.run_task_tests(task)

        return self.report()
