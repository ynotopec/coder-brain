import pytest


def test_llm_config_from_env(monkeypatch):
    from coder_brain.llm import LLMConfig

    monkeypatch.setenv("LLM_PROVIDER", "mock")
    monkeypatch.setenv("LLM_MODEL", "dummy")
    monkeypatch.setenv("LLM_MAX_TOKENS", "256")
    monkeypatch.setenv("LLM_TEMPERATURE", "0.5")

    config = LLMConfig.from_env()
    assert config
    assert config.provider == "mock"
    assert config.model == "dummy"
    assert config.max_tokens == 256
    assert pytest.approx(config.temperature, rel=1e-6) == 0.5


def test_mock_language_model_behaviour():
    from coder_brain.llm import MockLanguageModel

    model = MockLanguageModel()
    response = model.plan(
        instructions="Create a plan",
        context=(
            "Task: Implement feature X\n"
            "Module src/app: Core application logic\n"
            "File handlers.py: Endpoint handlers\n"
            "File services.py: Business rules\n"
        ),
    )
    assert response.startswith("Mock plan:")
    # Step numbering should now be explicit and start with clarifying the objective.
    assert "1. Clarify the objective: Implement feature X." in response
    # Ensure each file is represented in the audit section with descriptive text.
    assert "Review handlers.py (Endpoint handlers)." in response
    assert "Review services.py (Business rules)." in response
    # A final validation step should still be present.
    assert "Run the full test suite" in response
