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
    from coder_brain.llm import MockLanguageModel

    agent = CoderBrainAgent(tmp_path, language_model=MockLanguageModel())
    agent.bootstrap()

    task = Task(description="Fix app handle response bug", keywords=["handle", "app"])
    agent.create_plan(task)

    report = agent.report()
    assert "Prepared plan" in report
    assert "LLM-generated plan" in report
    hits = agent.inspect_code("handle")
    assert any("app.py" in hit for hit in hits)

    # Ensure module summaries are populated for context selection
    module_summary = agent.long_term_memory.summarize_module(tmp_path / "pkg")
    assert module_summary
