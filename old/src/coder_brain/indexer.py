"""Code indexing to provide an external memory to the agent."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Optional


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
        self._vector_index = None
        self._llama_available: Optional[bool] = None
        self.using_llama_index: bool = False

    def scan(self) -> None:
        documents = []
        llama_document = self._maybe_import_llama_document()

        for path in self._iter_source_files(self.root):
            preview = _file_preview(path)
            self.files[path] = IndexedFile(path=path, size=path.stat().st_size, preview=preview)
            if llama_document:
                try:
                    text = path.read_text(encoding="utf-8", errors="ignore")
                except (OSError, UnicodeDecodeError):
                    continue
                documents.append(
                    llama_document(text=text, metadata={"path": str(path)})
                )

        if documents:
            self._build_llama_index(documents)

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

        vector_hits = self._search_llama_index(query, limit=limit)
        if vector_hits:
            return vector_hits

        results: List[IndexedFile] = []
        query_lower = query.lower()
        for entry in self.files.values():
            haystack = f"{entry.path.name} {entry.preview}".lower()
            if query_lower in haystack:
                results.append(entry)
        results.sort(key=lambda item: item.path)
        return results[:limit]

    def _maybe_import_llama_document(self):
        if not self._can_use_llama_index():
            return None
        try:  # pragma: no cover - exercised only when optional dependency installed
            from llama_index.core import Document
        except Exception:
            return None
        return Document

    def _build_llama_index(self, documents: List[object]) -> None:
        """Initialise a FAISS-backed index if the stack is installed."""

        if not self._can_use_llama_index():
            return

        try:  # pragma: no cover - depends on optional packages
            import faiss
            from llama_index.core import StorageContext, VectorStoreIndex
            from llama_index.core.embeddings.mock import MockEmbedding
            from llama_index.vector_stores.faiss import FaissVectorStore
        except Exception:
            return

        if not documents:
            return

        base_index = faiss.IndexFlatL2(1536)
        vector_store = FaissVectorStore(faiss_index=base_index)
        storage_context = StorageContext.from_defaults(vector_store=vector_store)
        self._vector_index = VectorStoreIndex.from_documents(
            documents,
            storage_context=storage_context,
            embed_model=MockEmbedding(),
        )
        self.using_llama_index = True

    def _search_llama_index(self, query: str, limit: int) -> List[IndexedFile]:
        if not self._vector_index or not self.using_llama_index:
            return []

        try:  # pragma: no cover - depends on optional packages
            nodes = self._vector_index.as_retriever(similarity_top_k=limit).retrieve(query)
        except Exception:
            return []

        results: List[IndexedFile] = []
        for node in nodes:
            path_meta = node.metadata.get("path") if hasattr(node, "metadata") else None
            if not path_meta:
                continue
            preview = node.get_content(metadata_mode="all")[:200]
            results.append(
                IndexedFile(path=Path(path_meta), size=len(preview.encode("utf-8")), preview=preview)
            )
        return results

    def _can_use_llama_index(self) -> bool:
        if self._llama_available is not None:
            return self._llama_available
        try:  # pragma: no cover - depends on optional packages
            import faiss  # noqa: F401
            import llama_index  # noqa: F401
        except Exception:
            self._llama_available = False
        else:
            self._llama_available = True
        return self._llama_available

    def describe(self) -> str:
        lines = ["Indexed files:"]
        for indexed in sorted(self.files.values(), key=lambda f: f.path):
            lines.append(f"- {indexed.to_summary()}")
        return "\n".join(lines)
