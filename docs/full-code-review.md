# Full Code Review

Date: 2026-03-17
Scope: Entire repository (`src/`, `public/`, tests, and docs)

## Executive Summary

The codebase is in **good functional shape**: all automated tests pass, and there are no blocking runtime failures in the default test path. However, there are several quality and correctness concerns that should be addressed to improve reliability and maintainability.

- **Tests**: 26/26 passing.
- **Lint**: 29 warnings, 0 errors.
- **Overall assessment**: ✅ Stable behavior with targeted fixes recommended.

## What I Checked

1. Ran full test suite.
2. Ran ESLint.
3. Performed targeted manual review of core orchestration, safety, and tool-generation modules.

## Findings

### 1) Keyword extraction bug in offline normalization (High)

In offline mode, keyword extraction removes alphanumeric tokens instead of stripping punctuation, resulting in mostly empty keywords. This degrades routing/context quality.

- Evidence: `replace(/[\p{L}\p{N}_-]+/gu, '')` deletes whole words during keyword extraction in `_offlineCompletion`.【F:src/common.js†L34-L39】
- Impact: Lower-quality context building and poorer intent cues when running without API access.
- Recommendation: Replace with punctuation stripping (e.g., `replace(/[^\p{L}\p{N}_-]+/gu, '')`).

### 2) Mojibake / encoding issue in fallback French string (Medium)

The fallback response contains malformed UTF-8 apostrophe rendering (`Je nâai...`).

- Evidence: malformed French text literal in fallback message path.【F:src/common.js†L129-L134】
- Impact: User-facing quality issue; appears unprofessional and may break exact-match tests downstream.
- Recommendation: normalize source encoding and replace with proper apostrophe (`Je n’ai pas ...`).

### 3) Contradictory tool generation/sanitization policies (Medium)

Implementation generation asks for robust error handling, but sanitization explicitly rejects `try/catch/finally/throw`. This is internally conflicting and likely causes unnecessary promotion failures.

- Evidence: prompt requires proper error handling in generated code.【F:src/phase2/toolbuilder-sandbox.js†L138-L145】
- Evidence: sanitizer blocks `try/catch/finally/throw`.【F:src/phase2/toolbuilder-sandbox.js†L508-L513】
- Impact: Lower successful tool promotion rate; harder to build resilient generated tools.
- Recommendation: Allow structured error handling in sanitized code and rely on stricter dangerous-API blocking.

### 4) Dead/unused object creation in tool promotion path (Low)

`newTool` is built but never used after construction.

- Evidence: `newTool` constant created and then ignored; registration uses separate call arguments instead.【F:src/phase2/toolbuilder-sandbox.js†L468-L489】
- Impact: Minor maintainability issue and cognitive overhead.
- Recommendation: remove dead variable or pass the constructed object to registry.

### 5) Unused variables and imports across core modules (Low)

Lint warnings indicate drift and unused code paths.

- Evidence: `MAX_INPUT_LENGTH` and `MAX_RESPONSE_LENGTH` unused in context module.【F:src/phase1/context.js†L24-L25】
- Evidence: `OpenAIInterface` imported but unused in action engine.【F:src/phase2/action-engine.js†L1-L1】
- Evidence: multiple unused imports/vars in toolbuilder sandbox (worker/vm symbols etc.).【F:src/phase2/toolbuilder-sandbox.js†L6-L12】
- Impact: Noise in static analysis; reduced readability.
- Recommendation: clean unused declarations and keep lint warning budget near zero.

## Positive Notes

- Test coverage includes orchestration fallback, safety, and offline/online API behavior paths, which is excellent for regression resistance.【F:test/hybrid-orchestrator.test.js†L1-L138】【F:test/openai-interface.test.js†L1-L183】
- Error handling generally favors safe fallback responses over hard crashes in user-facing flows.【F:src/phase1/context.js†L61-L69】【F:src/phase2/action-engine.js†L109-L117】

## Priority Fix Order

1. Fix offline keyword extraction bug.
2. Fix fallback string encoding issue.
3. Align tool-generation prompt with sanitizer policy.
4. Remove dead/unused code and resolve lint warnings.

