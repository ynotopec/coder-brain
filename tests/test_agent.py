from pathlib import Path

def write_file(tmp_path: Path, name: str, content: str) -> Path:
    path = tmp_path / name
    path.write_text(content)
    return path


def test_agent_workflow(tmp_path):
    (tmp_path / "pkg").mkdir()
    write_file(tmp_path, "README.md", "Sample project\n")
    write_file(tmp_path, "pkg/app.py", "def handle():\n    return 'ok'\n")
    write_file(tmp_path, "pkg/utils.py", "VALUE = 42\n")

    from coder_brain.agent import CoderBrainAgent, Task

    agent = CoderBrainAgent(tmp_path)
    agent.bootstrap()

    task = Task(description="Fix app handle response bug", keywords=["handle", "app"])
    agent.create_plan(task)

    assert "Prepared plan" in agent.report()
    hits = agent.inspect_code("handle")
    assert any("app.py" in hit for hit in hits)
