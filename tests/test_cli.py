from pathlib import Path

import pytest

from coder_brain.cli import main


def test_main_requires_existing_directory(tmp_path: Path) -> None:
    missing = tmp_path / "does-not-exist"

    with pytest.raises(SystemExit) as excinfo:
        main(["--root", str(missing), "--task", "noop task"])

    assert excinfo.value.code == 2


def test_main_runs_with_valid_root(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    (tmp_path / "module").mkdir()
    (tmp_path / "module" / "file.py").write_text("print('hi')\n")

    exit_code = main(["--root", str(tmp_path), "--task", "noop task"])

    captured = capsys.readouterr().out
    assert exit_code == 0
    assert "Indexed project" in captured
    assert "Prepared plan for task" in captured


def test_main_auto_searches_with_keywords(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    (tmp_path / "module").mkdir()
    (tmp_path / "module" / "file.py").write_text("def handle():\n    return 'ok'\n")

    exit_code = main(
        [
            "--root",
            str(tmp_path),
            "--task",
            "Audit handle",
            "--keywords",
            "handle",
            "--auto-search",
        ]
    )

    captured = capsys.readouterr().out
    assert exit_code == 0
    assert "Ran code search" in captured
