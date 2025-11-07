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
        context="Line one\nLine two\nLine three",
    )
    assert "Mock plan" in response
    assert response.count("-") >= 3
