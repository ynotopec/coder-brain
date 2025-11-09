import sys
import types

import pytest


def test_llm_config_from_env(monkeypatch):
    from coder_brain.llm import LLMConfig

    monkeypatch.setenv("LLM_PROVIDER", "mock")
    monkeypatch.setenv("LLM_MODEL", "dummy")
    monkeypatch.setenv("LLM_MAX_TOKENS", "256")
    monkeypatch.setenv("LLM_TEMPERATURE", "0.5")
    monkeypatch.setenv("LLM_BASE_URL", "http://localhost:8000")

    config = LLMConfig.from_env()
    assert config
    assert config.provider == "mock"
    assert config.model == "dummy"
    assert config.max_tokens == 256
    assert pytest.approx(config.temperature, rel=1e-6) == 0.5
    assert config.base_url == "http://localhost:8000"


def test_openai_provider_uses_base_url(monkeypatch):
    from coder_brain.llm import LLMConfig, create_language_model

    recorded_kwargs: dict[str, object] = {}
    recorded_request: dict[str, object] = {}

    class DummyResponses:
        def create(self, **kwargs):
            recorded_request.update(kwargs)
            return types.SimpleNamespace(
                output=[
                    types.SimpleNamespace(
                        content=[{"type": "output_text", "text": "Hello"}]
                    )
                ]
            )

    class DummyClient:
        def __init__(self, **kwargs):
            recorded_kwargs.update(kwargs)
            self.responses = DummyResponses()

    dummy_module = types.SimpleNamespace(OpenAI=DummyClient)
    monkeypatch.setitem(sys.modules, "openai", dummy_module)

    config = LLMConfig(
        provider="openai",
        model="dummy-model",
        api_key=None,
        base_url="http://localhost:8080/v1",
    )

    model = create_language_model(config)

    result = model.complete(system="S", user="U")

    assert result == "Hello"
    assert recorded_kwargs == {"base_url": "http://localhost:8080/v1"}
    assert recorded_request["model"] == "dummy-model"



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
