# Repository Review (2026-02-28)

## Scope and method
- Reviewed project documentation, runtime entrypoints, and orchestration flow (`README.md`, `docs/*.md`, `index.js`, `src/server.js`).
- Executed automated checks (`npm test`, `npm run lint`) to evaluate current engineering health.

## What is working well
1. **Clear phase-based architecture**
   - The codebase follows a readable 4-phase pipeline (context/intent → execution → aggregation → output/learning), which makes orchestration behavior easy to reason about.
2. **Solid baseline test coverage for core behavior**
   - `node --test` currently passes with 26 tests, including retries, hybrid flow, safety, and OpenAI interface error handling.
3. **Good runtime resilience patterns**
   - The orchestrator implements retries, fallback responses, risk checks, HITL gates for high-risk actions, and observability logging.
4. **Practical local/web ergonomics**
   - The repository is easy to run via `make run`, `npm start`, and a lightweight static+API HTTP server.

## Main issues identified
1. **Lint pipeline is currently broken**
   - `npm run lint` fails because ESLint v10 requires a flat config (`eslint.config.js`) and no compatible configuration file is present.
   - Impact: code style/static checks are not enforceable in CI/local dev.
2. **Large monolithic orchestrator class**
   - `index.js` centralizes many responsibilities (initialization, routing, retries, risk workflow, aggregation, post-processing).
   - Impact: harder maintainability and higher regression risk for future feature work.
3. **Mixed language and consistency drift in developer-facing outputs**
   - Docs/messages are partly French and partly English.
   - Impact: inconsistent onboarding and potential confusion for contributors/users.
4. **Potential security hardening gap for HTTP API defaults**
   - Server currently enables permissive CORS (`*`) for all requests.
   - Impact: acceptable for local/demo mode, but risky default posture for broader deployments.

## Prioritized recommendations

### P0 (immediate)
1. **Restore linting**
   - Add `eslint.config.js` (flat config) compatible with ESLint 10.
   - Wire lint into CI (and optionally pre-commit hooks) so regressions are caught early.

### P1 (near-term)
2. **Modularize the orchestration entrypoint**
   - Split `BrainSystem` orchestration concerns into smaller services:
     - intent execution coordinator
     - retry/fallback policy
     - post-processing/memory writer
   - Keep `index.js` as wiring/composition root.
3. **Define deployment profiles for API security defaults**
   - Add environment-based CORS policy and document “dev vs prod” defaults.

### P2 (medium-term)
4. **Documentation normalization**
   - Choose a primary language for operational docs and standardize key user-facing messages.
5. **Add architecture decision records (ADRs)**
   - Capture major choices (offline mode behavior, retry thresholds, HITL policy) for long-term clarity.

## Suggested next actions (1 sprint)
1. Add ESLint flat config + CI lint step.
2. Extract retry and intent-execution orchestration into dedicated modules.
3. Add `CORS_ORIGIN` configuration and default-safe behavior for non-local environments.
4. Publish a short `CONTRIBUTING.md` with run/test/lint expectations.

## Validation snapshot
- ✅ `npm test` passed (26/26 tests).
- ❌ `npm run lint` failed due to missing ESLint flat configuration.
