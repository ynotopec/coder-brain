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
    assert "Simulated execution walkthrough" in report
    assert "language model" in report
    hits = agent.inspect_code("handle")
    assert any("app.py" in hit for hit in hits)

    # Ensure module summaries are populated for context selection
    module_summary = agent.long_term_memory.summarize_module(tmp_path / "pkg")
    assert module_summary


def test_agent_notes_empty_project(tmp_path):
    from coder_brain.agent import CoderBrainAgent, Task
    from coder_brain.llm import MockLanguageModel

    agent = CoderBrainAgent(tmp_path, language_model=MockLanguageModel())
    agent.bootstrap()

    task = Task(description="Greenfield feature", keywords=["feature"])
    agent.create_plan(task)

    report = agent.report()
    assert "(empty)" in report
    assert "project index is currently empty" in report.lower()
    assert "working memory" in report.lower()


def test_agent_can_execute_python(tmp_path):
    from coder_brain.agent import CoderBrainAgent
    from coder_brain.llm import MockLanguageModel

    agent = CoderBrainAgent(tmp_path, language_model=MockLanguageModel())
    result = agent.execute_python("print('ready')")

    assert result.ok
    report = agent.report()
    assert "Executed python snippet" in report
    assert "ready" in report
