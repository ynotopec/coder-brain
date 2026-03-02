# Repository Review (2026-03-02)

## Scope and method
- Reviewed core documentation and runtime architecture (`README.md`, `docs/architecture.md`, `src/index.js`, `src/server.js`).
- Ran baseline quality checks to validate current status (`npm test`, `npm run lint`).

## Current strengths
1. **Reliable baseline behavior with automated regression coverage**
   - The project test suite passes fully (26/26), covering orchestration flow, safety checks, fallback logic, and OpenAI interface edge cases.
2. **Clear phased architecture in implementation and docs**
   - The codebase is organized around a multi-phase flow with dedicated modules for context, execution, aggregation, and post-processing.
3. **Pragmatic resilience patterns already present**
   - Retries, fallback responses, risk checks, and human-in-the-loop approval paths are built into core processing.
4. **Low-friction local developer experience**
   - The repo provides straightforward run/test/lint scripts and a simple server entrypoint for local experimentation.

## Key issues identified
1. **Static analysis is permissive and currently noisy**
   - `npm run lint` succeeds but reports **32 warnings**, dominated by unused variables and unused function parameters.
   - Impact: warnings can hide meaningful signals and reduce confidence in lint output.
2. **Orchestration responsibilities remain highly centralized**
   - `BrainSystem` (in `src/index.js`) still carries substantial coordination logic across intent handling, retries, policy checks, and fallback shaping.
   - Impact: future feature work risks increasing coupling and regression surface.
3. **Language consistency remains mixed in runtime and test artifacts**
   - User-facing text and tests include mixed French/English content.
   - Impact: onboarding and contribution consistency may degrade over time.
4. **API hardening posture appears tuned for local/demo usage**
   - HTTP defaults remain simple and developer-friendly; deployment-grade guardrails should be explicit in docs/config.
   - Impact: risk of insecure defaults being promoted to shared environments.

## Prioritized recommendations

### P0 (immediate)
1. **Reduce lint warning debt and enforce thresholds**
   - Remove or intentionally underscore unused variables/arguments (`_context`, `_err`) where appropriate.
   - Add CI behavior that fails on new warnings (or progressively enforce by directory) to prevent warning drift.

### P1 (near-term)
2. **Extract orchestration policies from `BrainSystem`**
   - Move retry policy, risk/HITL policy, and fallback shaping into dedicated modules/services.
   - Keep `src/index.js` as composition + high-level workflow wiring.
3. **Document explicit security profiles**
   - Add deployment profiles (local/dev/prod) for CORS and related runtime safeguards with clear defaults.

### P2 (medium-term)
4. **Normalize language and contributor guidance**
   - Standardize user-facing and developer-facing language strategy (single primary language + translation policy if needed).
5. **Capture major design decisions as ADRs**
   - Record decisions around offline mode behavior, safety thresholds, retry policy, and HITL approval semantics.

## Suggested next actions (1 sprint)
1. Resolve top lint warnings in `src/phase2/*` and `src/phase1/context.js` and enable warning-gating in CI.
2. Extract retry/risk/fallback orchestration concerns from `BrainSystem` into policy modules.
3. Add explicit `CORS_ORIGIN`/environment profile documentation and safer non-local defaults.
4. Add a concise `CONTRIBUTING.md` with coding, lint, and testing expectations.

## Validation snapshot
- ✅ `npm test` passed (26/26 tests).
- ✅ `npm run lint` passed with warnings (32 warnings, 0 errors).
