"""Lightweight language-model abstractions used by :mod:`coder_brain`."""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Optional


class LanguageModelError(RuntimeError):
    """Raised when a language model provider cannot satisfy a request."""


@dataclass
class LLMConfig:
    """Configuration for a language model provider."""

    provider: str
    model: str
    api_key: Optional[str] = None
    max_tokens: int = 1024
    temperature: float = 0.2

    @classmethod
    def from_env(cls, prefix: str = "LLM_") -> Optional["LLMConfig"]:
        """Build a configuration from environment variables."""

        provider = os.getenv(f"{prefix}PROVIDER")
        model = os.getenv(f"{prefix}MODEL")
        if not provider or not model:
            return None
        api_key = os.getenv(f"{prefix}API_KEY")
        max_tokens = int(os.getenv(f"{prefix}MAX_TOKENS", "1024"))
        temperature = float(os.getenv(f"{prefix}TEMPERATURE", "0.2"))
        return cls(
            provider=provider,
            model=model,
            api_key=api_key,
            max_tokens=max_tokens,
            temperature=temperature,
        )


class LanguageModel:
    """Abstract interface for chat-completion style language models."""

    def complete(self, *, system: str, user: str) -> str:
        raise NotImplementedError

    def summarize(self, *, instructions: str, text: str) -> str:
        """Summarise ``text`` given ``instructions``."""

        return self.complete(system=instructions, user=text)

    def plan(self, *, instructions: str, context: str) -> str:
        """Produce a plan from the given context."""

        return self.complete(system=instructions, user=context)


class MockLanguageModel(LanguageModel):
    """Deterministic language model used for tests and offline operation."""

    def __init__(self, config: Optional[LLMConfig] = None) -> None:
        self.config = config or LLMConfig(provider="mock", model="mock")

    def complete(self, *, system: str, user: str) -> str:
        key_lines = [line.strip() for line in user.splitlines() if line.strip()]
        if not key_lines:
            return "(no content)"
        # Limit the output to a handful of bullet points to mimic concise LLM outputs.
        bullets = [f"- {line[:120]}" for line in key_lines[:5]]
        header = "Mock plan" if "plan" in system.lower() else "Mock summary"
        return f"{header}:\n" + "\n".join(bullets)


def create_language_model(config: Optional[LLMConfig] = None) -> LanguageModel:
    """Factory returning a language model based on the provided configuration."""

    config = config or LLMConfig.from_env()
    if config is None:
        return MockLanguageModel()

    provider = config.provider.lower()
    if provider == "mock":
        return MockLanguageModel(config)
    if provider == "openai":  # pragma: no cover - requires optional dependency
        try:
            import openai
        except ImportError as exc:  # pragma: no cover - executed only with missing dependency
            raise LanguageModelError(
                "openai package is required for provider 'openai'"
            ) from exc

        class _OpenAIChatModel(LanguageModel):
            def __init__(self, openai_module, cfg: LLMConfig) -> None:
                self._client = openai_module.OpenAI(api_key=cfg.api_key)
                self._config = cfg

            def complete(self, *, system: str, user: str) -> str:  # pragma: no cover - network call
                response = self._client.responses.create(
                    model=self._config.model,
                    input=[
                        {
                            "role": "system",
                            "content": system,
                        },
                        {
                            "role": "user",
                            "content": user,
                        },
                    ],
                    temperature=self._config.temperature,
                    max_output_tokens=self._config.max_tokens,
                )
                if not getattr(response, "output", None):
                    raise LanguageModelError("Empty response from OpenAI API")
                return "".join(
                    chunk["text"]
                    for item in response.output
                    for chunk in getattr(item, "content", [])
                    if isinstance(chunk, dict) and chunk.get("type") == "output_text"
                )

        return _OpenAIChatModel(openai, config)

    raise LanguageModelError(f"Unsupported LLM provider '{config.provider}'")


__all__ = [
    "LLMConfig",
    "LanguageModel",
    "LanguageModelError",
    "MockLanguageModel",
    "create_language_model",
]

