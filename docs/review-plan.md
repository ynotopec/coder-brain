# Review Plan

Date: 2026-03-17
Scope: Follow-up plan for findings in `docs/full-code-review.md`

## Objectives

1. Resolve high/medium severity correctness issues first.
2. Reduce lint warning count to near zero.
3. Preserve current test pass rate while improving quality.

## Workstreams

### 1) Correctness fixes (P0)

- Fix offline keyword normalization in `src/common.js` so words are preserved and punctuation is stripped.
- Correct mojibake in the French fallback string in `src/common.js`.
- Add/adjust targeted unit tests in `test/openai-interface.test.js` for offline keyword extraction and fallback text quality.

**Exit criteria**
- Offline keyword extraction returns meaningful alphanumeric tokens.
- Fallback message contains valid UTF-8 apostrophe/characters.
- Related tests pass.

### 2) Toolbuilder policy alignment (P1)

- Reconcile generator prompt requirements with sanitizer restrictions in `src/phase2/toolbuilder-sandbox.js`.
- Decide one policy:
  - either allow structured error handling (`try/catch`) with strict dangerous-API blocking,
  - or remove “robust error handling” requirement from generation prompt.
- Add tests that verify accepted/rejected patterns follow the selected policy.

**Exit criteria**
- Prompt and sanitizer are consistent.
- Tool promotion success rate does not regress in existing tests.

### 3) Lint/dead code cleanup (P2)

- Remove unused declarations/imports flagged by ESLint in:
  - `src/phase1/context.js`
  - `src/phase2/action-engine.js`
  - `src/phase2/toolbuilder-sandbox.js`
- Remove or use dead `newTool` object in tool promotion path.

**Exit criteria**
- ESLint warning count significantly reduced (target: 0–5 warnings).
- No behavior regressions in test suite.

## Verification checklist

Run in order after each workstream:

1. `npm test`
2. `npm run lint`

Optional (if available):

3. Track tool promotion pass/fail counts before and after policy change.

## Delivery slices

- **Slice A**: `src/common.js` correctness + tests.
- **Slice B**: Toolbuilder prompt/sanitizer alignment + tests.
- **Slice C**: Lint and dead-code cleanup.

Each slice should be merged independently to minimize rollback risk.
