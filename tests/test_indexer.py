from pathlib import Path

from coder_brain.indexer import ProjectIndexer


def test_indexer_builds_previews(tmp_path):
    (tmp_path / "src").mkdir()
    file_path = tmp_path / "src" / "module.py"
    file_path.write_text("""def add(a, b):\n    return a + b\n""")

    indexer = ProjectIndexer(tmp_path)
    indexer.scan()

    assert file_path in indexer.files
    summary = indexer.files[file_path].to_summary()
    assert "module.py" in summary
