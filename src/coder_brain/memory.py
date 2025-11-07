"""Memory abstractions for the coder-brain agent."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, Iterable, List, Optional


@dataclass
class FileContext:
    """Representation of a file loaded into working memory."""

    path: Path
    summary: str
    highlighted_regions: List[str] = field(default_factory=list)

    def describe(self) -> str:
        """Return a human readable description of the file context."""

        regions = ", ".join(self.highlighted_regions) if self.highlighted_regions else "(no highlights)"
        return f"{self.path}: {self.summary} | focus: {regions}"


@dataclass
class WorkingMemory:
    """Working memory stores a limited number of file contexts at a time."""

    limit: int = 7
    _slots: List[FileContext] = field(default_factory=list)

    def reset(self) -> None:
        self._slots.clear()

    def load(self, contexts: Iterable[FileContext]) -> None:
        """Load contexts into working memory keeping the configured limit."""

        for context in contexts:
            self._add_context(context)

    def _add_context(self, context: FileContext) -> None:
        if context in self._slots:
            return
        if len(self._slots) >= self.limit:
            self._slots.pop(0)
        self._slots.append(context)

    def to_bullet_list(self) -> str:
        return "\n".join(f"- {ctx.describe()}" for ctx in self._slots)

    def __iter__(self):
        return iter(self._slots)


@dataclass
class LongTermMemory:
    """Stores persistent summaries and architecture decisions."""

    file_summaries: Dict[Path, str] = field(default_factory=dict)
    module_summaries: Dict[Path, str] = field(default_factory=dict)
    decisions: List[str] = field(default_factory=list)

    def add_summary(self, path: Path, summary: str) -> None:
        self.file_summaries[path] = summary

    def summarize(self, path: Path) -> Optional[str]:
        return self.file_summaries.get(path)

    def add_module_summary(self, path: Path, summary: str) -> None:
        self.module_summaries[path] = summary

    def summarize_module(self, path: Path) -> Optional[str]:
        return self.module_summaries.get(path)

    def add_decision(self, note: str) -> None:
        self.decisions.append(note)

    def export(self) -> str:
        lines = ["Long term memory summaries:"]
        for path, summary in sorted(self.file_summaries.items()):
            lines.append(f"- {path}: {summary}")
        if self.module_summaries:
            lines.append("Module summaries:")
            for path, summary in sorted(self.module_summaries.items()):
                lines.append(f"- {path}: {summary}")
        if self.decisions:
            lines.append("Decisions:")
            lines.extend(f"  * {note}" for note in self.decisions)
        return "\n".join(lines)
