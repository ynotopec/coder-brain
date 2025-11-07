"""Search tool used by the agent to query the code base."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import List, Sequence

from ..indexer import ProjectIndexer


@dataclass
class SearchResult:
    path: Path
    line_number: int
    line: str

    def format(self) -> str:
        return f"{self.path}:{self.line_number}: {self.line.strip()}"


def search_files(pattern: str, files: Sequence[Path], case_sensitive: bool = False) -> List[SearchResult]:
    results: List[SearchResult] = []
    if not pattern:
        return results
    compare = (lambda text: pattern in text) if case_sensitive else (lambda text: pattern.lower() in text.lower())
    for path in files:
        try:
            for number, line in enumerate(path.read_text(encoding="utf-8", errors="ignore").splitlines(), start=1):
                if compare(line):
                    results.append(SearchResult(path=path, line_number=number, line=line))
        except OSError:
            continue
    return results


def search_index(indexer: ProjectIndexer, query: str, limit: int = 5) -> List[str]:
    """Return formatted summaries for search results."""

    hits = indexer.search(query, limit=limit)
    return [hit.to_summary() for hit in hits]
