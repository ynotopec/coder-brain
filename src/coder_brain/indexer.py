"""Code indexing to provide an external memory to the agent."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List


IGNORED_SUFFIXES = {".png", ".jpg", ".jpeg", ".gif", ".svg", ".pyc", ".class"}
MAX_PREVIEW_LINES = 20


def _file_preview(path: Path, max_lines: int = MAX_PREVIEW_LINES) -> str:
    try:
        text = path.read_text(encoding="utf-8", errors="ignore")
    except (OSError, UnicodeDecodeError):
        return "<unreadable>"
    lines = text.splitlines()
    preview = "\n".join(lines[:max_lines])
    if len(lines) > max_lines:
        preview += "\n…"
    return preview


@dataclass
class IndexedFile:
    path: Path
    size: int
    preview: str

    def to_summary(self) -> str:
        return f"{self.path} ({self.size} bytes)" if not self.preview else f"{self.path}: {self.preview.splitlines()[0]}"


class ProjectIndexer:
    """Scan a project directory and keep lightweight summaries."""

    def __init__(self, root: Path) -> None:
        self.root = root
        self.files: Dict[Path, IndexedFile] = {}

    def scan(self) -> None:
        for path in self._iter_source_files(self.root):
            preview = _file_preview(path)
            self.files[path] = IndexedFile(path=path, size=path.stat().st_size, preview=preview)

    def _iter_source_files(self, root: Path) -> Iterable[Path]:
        for path in root.rglob("*"):
            if not path.is_file():
                continue
            if path.suffix in IGNORED_SUFFIXES:
                continue
            if any(part.startswith(".") for part in path.relative_to(root).parts):
                continue
            yield path

    def search(self, query: str, limit: int = 5) -> List[IndexedFile]:
        """Very small search facility over previews and file names."""

        results: List[IndexedFile] = []
        query_lower = query.lower()
        for entry in self.files.values():
            haystack = f"{entry.path.name} {entry.preview}".lower()
            if query_lower in haystack:
                results.append(entry)
        results.sort(key=lambda item: item.path)
        return results[:limit]

    def describe(self) -> str:
        lines = ["Indexed files:"]
        if not self.files:
            lines.append("(none found)")
        else:
            for indexed in sorted(self.files.values(), key=lambda f: f.path):
                lines.append(f"- {indexed.to_summary()}")
        return "\n".join(lines)
