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
    base_url: Optional[str] = None
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
        base_url = os.getenv(f"{prefix}BASE_URL") or os.getenv(f"{prefix}ENDPOINT")
        max_tokens = int(os.getenv(f"{prefix}MAX_TOKENS", "1024"))
        temperature = float(os.getenv(f"{prefix}TEMPERATURE", "0.2"))
        return cls(
            provider=provider,
            model=model,
            api_key=api_key,
            base_url=base_url,
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
        if "plan" in system.lower():
            return self._generate_plan(user)
        return self._generate_summary(user)

    def _generate_plan(self, context: str) -> str:
        lines = [line.strip() for line in context.splitlines() if line.strip()]
        task_line = next(
            (line for line in lines if line.lower().startswith("task:")),
            "Task: (unspecified task)",
        )
        task_description = (
            task_line.split(":", 1)[1].strip() if ":" in task_line else task_line
        )

        files: list[tuple[str, str]] = []
        modules: list[tuple[str, str]] = []
        notes: list[str] = []
        for line in lines:
            if line.lower().startswith("file ") and ":" in line:
                name, detail = line[5:].split(":", 1)
                files.append((name.strip(), detail.strip()))
            elif line.lower().startswith("module ") and ":" in line:
                name, detail = line[7:].split(":", 1)
                modules.append((name.strip(), detail.strip()))
            elif any(prefix in line.lower() for prefix in ("risk", "note", "concern")):
                notes.append(line)

        test_targets = [line for line in lines if "test" in line.lower()]

        plan_lines: list[str] = ["Mock plan:"]
        plan_lines.append(f"1. Clarify the objective: {task_description}.")

        if files:
            plan_lines.append("2. Audit current implementation:")
            for name, detail in files:
                plan_lines.append(f"   - Review {name} ({detail}).")
        else:
            plan_lines.append(
                "2. Identify which files govern this behaviour and gather relevant history."
            )

        if modules:
            plan_lines.append(
                "3. Model the solution across modules to avoid regressions and duplication:"
            )
            for name, detail in modules:
                plan_lines.append(f"   - Plan changes for module {name} ({detail}).")
        else:
            plan_lines.append(
                "3. Outline the implementation approach, covering data flow, error handling, and edge cases."
            )

        if notes:
            plan_lines.append("4. Mitigate known risks before coding:")
            for note in notes:
                plan_lines.append(f"   - {note}")
            step_offset = 5
        else:
            plan_lines.append(
                "4. Anticipate edge cases, performance implications, and opportunities to simplify the design."
            )
            step_offset = 5

        if test_targets:
            plan_lines.append(
                f"{step_offset}. Extend or add automated tests covering {task_description}."
            )
            step_offset += 1
        else:
            plan_lines.append(
                f"{step_offset}. Design new test scenarios to validate {task_description}."
            )
            step_offset += 1

        plan_lines.append(
            f"{step_offset}. Implement the changes incrementally, validating behaviour after each step."
        )
        plan_lines.append(
            f"{step_offset + 1}. Run the full test suite and perform targeted manual verification before shipping."
        )
        plan_lines.append(
            f"{step_offset + 2}. Document decisions and follow-ups so future contributors can iterate even faster."
        )

        return "\n".join(plan_lines)

    def _generate_summary(self, text: str) -> str:
        key_lines = [line.strip() for line in text.splitlines() if line.strip()]
        if not key_lines:
            return "(no content)"

        bullets = []
        for line in key_lines[:5]:
            truncated = line[:120]
            if len(line) > 120:
                truncated += "…"
            bullets.append(f"- {truncated}")

        return "Mock summary:\n" + "\n".join(bullets)


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
                client_kwargs: dict[str, object] = {}
                if cfg.api_key:
                    client_kwargs["api_key"] = cfg.api_key
                if cfg.base_url:
                    client_kwargs["base_url"] = cfg.base_url
                self._client = openai_module.OpenAI(**client_kwargs)
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

