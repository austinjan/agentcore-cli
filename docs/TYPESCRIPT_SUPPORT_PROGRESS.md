# TypeScript (Strands) support — progress tracker

Living checklist for the TypeScript support initiative. Update as you go. Every code change should be followed by a
commit (one logical unit per commit) and an entry in the **Commit log** at the bottom so the next person can reconstruct
exactly where things stand by reading this file + `git log`.

**Companion docs:**

- `docs/TYPESCRIPT_SUPPORT_HANDOFF.md` — prose handoff (what was merged pre-progress-doc, SDK surface notes, gotchas).
- `~/.claude/plans/lets-add-typescript-to-jazzy-honey.md` — original full plan (owner machine).

**Branch / starting point:** `main` @ `50a6cbd`
(`feat(typescript): scaffold TypeScript language support (WIP checkpoint)`)

**AWS test account for deploy integ:** `325335451438` via `AWS_PROFILE=deploy` (refresh with
`ada credentials update --account 325335451438 --provider isengard --role Admin --profile deploy`).

---

## Legend

- `[x]` done + committed
- `[~]` in progress / partial
- `[ ]` not started
- `[!]` blocked — see note

---

## Phase 0 — Verification sweep (no code changes)

- [x] Confirm `isDevSupported` guard rejects TS — **confirmed** at `src/cli/operations/dev/config.ts:49-54`. Must
      remove.
- [x] Confirm packaging dispatcher already handles Node runtime — **confirmed clean** at
      `src/lib/packaging/index.ts:34-56` (`isNodeRuntime` branch exists). No change needed.
- [x] Grep CDK constructs for `PYTHON_` assumptions — **confirmed clean**. Only match is in a test file
      (`AgentCoreRuntime.test.ts:13`). Production CDK code forwards `runtimeVersion` generically.

---

## Phase 1 — Already merged (pre-progress-doc checkpoint)

Captured in commit `50a6cbd`. Do NOT re-do these.

- [x] Schema constants: `DEFAULT_NODE_VERSION`, `DEFAULT_ENTRYPOINT_BY_LANGUAGE`, `DEFAULT_RUNTIME_BY_LANGUAGE`
      (`src/schema/constants.ts`).
- [x] TUI unblock: TypeScript option no longer `disabled` (`src/cli/tui/screens/agent/types.ts`).
- [x] CLI validator: removed hard reject of `--language TypeScript`; added framework gate (TS ⇒ Strands only)
      (`src/cli/commands/add/validate.ts`).
- [x] CLI flag help updated (`src/cli/commands/create/command.tsx`).
- [x] TUI framework filter by language (`src/cli/tui/screens/generate/types.ts` + `GenerateWizardUI.tsx`).
- [x] Language-aware spec defaults in `schema-mapper.ts` (entrypoint + runtimeVersion branch on TS).
- [x] `npx tsc --noEmit` clean.

---

## Phase 2 — Dev-server unblock (small, unblocking change)

- [ ] Remove / relax `isDevSupported` Python-only guard at `src/cli/operations/dev/config.ts:35-57`.
  - **Approach:** drop the `!isPythonAgent(agent)` branch entirely. Downstream (`codezip-dev-server.ts:120-126`) already
    picks `npx tsx watch` when `isPython` is false, and `isPython` at `config.ts:141` keys off entrypoint extension — so
    it will naturally be `false` for `main.ts`.
  - **Verify:** unit test in `codezip-dev-server.test.ts` still green; add a TS case (see Phase 6).
  - **Notes:**

---

## Phase 3 — Template assets (the bulk of the work)

Author under `src/assets/typescript/http/strands/`. Mirror Python shape at `src/assets/python/http/strands/`.

**SDK surface (confirmed in handoff):**

- `@strands-agents/sdk@1.0.0-rc.4` — `Agent`, `tool`, `BedrockModel`, `McpClient`; provider subpaths under
  `/models/{bedrock,anthropic,openai,google}`; streaming via `agent.stream()` yielding `AgentStreamEvent`; filter
  `contentBlockDelta` + `textDelta`.
- `bedrock-agentcore@0.2.2` — `BedrockAgentCoreApp` from `/runtime`, identity HOFs from `/identity`.

- [ ] `base/gitignore.template` — `node_modules`, `dist`, `.env*`, `*.log`, `.venv`.
  - **Notes:**
- [ ] `base/package.json` (Handlebars) — name, deps pinned (`@strands-agents/sdk@1.0.0-rc.4`, `bedrock-agentcore@0.2.2`,
      `tsx`, `typescript`, `@types/node`).
  - **Notes:**
- [ ] `base/tsconfig.json` — target ES2022, module NodeNext, strict, outDir `dist`.
  - **Notes:**
- [ ] `base/main.ts` — `BedrockAgentCoreApp` with `invocationHandler.process` async generator; calls
      `agent.stream(prompt)`; yields `{ data: string }`. Verify event shape against `dist/src/models/streaming.d.ts` in
      the Strands SDK tarball.
  - **Notes:**
- [ ] `base/README.md` — short, mirrors Python README structure.
  - **Notes:**
- [ ] `base/mcp_client/client.ts` — mirrors Python `mcp_client/client.py` (gateway + auth paths). Uses `McpClient` from
      Strands with a `Transport` from `@modelcontextprotocol/sdk/shared/transport.js`.
  - **Notes:**
- [ ] `base/model/load.ts` — mirrors Python `model/load.py`; per-provider branches for Bedrock / Anthropic / OpenAI /
      Gemini using Strands provider subpaths.
  - **Notes:**
- [ ] `capabilities/memory/session.ts` — mirrors Python `capabilities/memory/session.py`.
  - **Notes:**
- [ ] Confirm Handlebars variables consumed match Python templates: `name`, `agentName`, `modelProvider`, `hasGateway`,
      `gatewayAuthTypes`, `gatewayProviders`, `hasMemory`, `memoryProviders`, `identityProviders`,
      `sessionStorageMountPath`, `isVpc`.
  - **Notes:**
- [ ] Run `npm run test:update-snapshots` and **eyeball every generated snapshot** before committing.
  - **Notes:**

---

## Phase 4 — Container template

Under `src/assets/container/typescript/`.

- [ ] `Dockerfile` — base `public.ecr.aws/docker/library/node:22-slim`; deps layer first (`package.json` +
      `package-lock.json` → `npm ci --omit=dev`), then source. Either `npx tsx main.ts` or a `tsc` build step +
      `node dist/main.js`. Expose 8080.
  - **Notes:**
- [ ] `dockerignore.template` — `node_modules`, `dist`, `.env*`, `.git/`.
  - **Notes:**

---

## Phase 5 — Node setup helper + create-flow wiring

- [ ] Create `src/cli/operations/node/setup.ts` with `setupNodeProject({ projectDir })` that shells out to `npm install`
      and returns `{ status: 'success' | 'error' | 'warn', ... }` (match `src/cli/operations/python/setup.ts` shape).
  - **Notes:**
- [ ] Wire into `src/cli/tui/screens/create/useCreateFlow.ts` around line 431 — parallel branch to the existing Python
      setup step when `language === 'TypeScript' && agentType === 'create'`.
  - **Notes:**
- [ ] Extend `checkCreateDependencies({ language })` in `src/cli/external-requirements/checks.ts` (called from
      `src/cli/commands/create/action.ts`) to verify `node` + `npm` on PATH when `language === 'TypeScript'`.
  - **Notes:**

---

## Phase 6 — Tests

- [ ] **Snapshots** — `src/assets/__tests__/assets.snapshot.test.ts` already auto-discovers `typescript/*` files (lines
      106-120). Run `npm run test:update-snapshots` after Phase 3 templates land.
  - **Notes:**
- [ ] **Create integ test** — duplicate the Python block in `integ-tests/create-with-agent.test.ts` for TypeScript.
      Assert: `app/<name>/main.ts`, `app/<name>/package.json`, `app/<name>/node_modules/` (if install ran), and
      `agentcore.json` has `runtimeVersion: "NODE_22"` + `entrypoint: "main.ts"`.
  - **Notes:**
- [ ] **Dev-server unit test** — add a TS variant in `src/cli/operations/dev/__tests__/codezip-dev-server.test.ts`
      asserting spawn config is `{ cmd: 'npx', args: ['tsx', 'watch', 'main.ts'], ... }`.
  - **Notes:**
- [ ] **TUI harness walkthrough** — mirror an existing Python walkthrough under `integ-tests/tui/` selecting TypeScript
      → Strands.
  - **Notes:**
- [ ] **E2E container deploy test** — `integ-tests/deploy-typescript-strands-container.test.ts`: scaffold → container
      build → `agentcore deploy` (account 325335451438, `AWS_PROFILE=deploy`) → `agentcore invoke --prompt "ping"` →
      teardown on exit and on failure. Gate behind the same env flag as other AWS integ tests.
  - **Notes:**
- [ ] **Non-Strands rejection test** — confirm
      `agentcore add agent --language TypeScript --framework LangChain_LangGraph` fails fast.
  - **Notes:**

---

## Phase 7 — Documentation

- [ ] `docs/frameworks.md` — add "Supported languages" section.
  - **Notes:**
- [ ] `docs/local-development.md` — TS dev loop (Node ≥ 18, `npx tsx watch`).
  - **Notes:**
- [ ] `docs/commands.md` — `--language TypeScript` examples.
  - **Notes:**
- [ ] `docs/container-builds.md` — TS Dockerfile example.
  - **Notes:**
- [ ] `README.md` — one-line mention in the feature list.
  - **Notes:**

---

## Phase 8 — Verification (end-to-end, manual)

Run from a clean scratch dir against the deploy profile. Record results inline.

- [ ] `npm run test:unit` green.
- [ ] `npm run test:integ` green (excluding gated deploy test unless credentials refreshed).
- [ ] `agentcore create my-ts-agent` → TypeScript → Strands → Bedrock → no memory → confirm scaffold.
- [ ] `agentcore dev` starts via `npx tsx watch main.ts`, binds 8080, reloads on edit.
- [ ] `agentcore invoke --prompt "hello"` against the dev server streams a response.
- [ ] `agentcore deploy` (CodeZip) succeeds against test account; post-deploy `invoke` works.
- [ ] E2E container deploy test passes (Phase 6).
- [ ] Non-Strands framework rejection message is clear.
- [ ] Python regression smoke path unchanged.
- [ ] Docs read cleanly; examples copy-paste.

---

## Out of scope (do not attempt)

- LangChain/LangGraph, GoogleADK, OpenAIAgents TS templates.
- A2A / MCP protocol TS templates.
- pnpm / yarn.
- BYO TypeScript (already works via `--type byo`).

---

## Known gotchas

- Strands TS SDK is at `1.0.0-rc.4` (very new). Pin exactly and re-check event-type names before release.
- `BedrockAgentCoreApp` (TS) is Fastify-based, not ASGI. `npx tsx watch` gives good-enough dev parity with Python's
  uvicorn `--reload`.
- `isDevSupported` Python guard is easy to miss. See Phase 2.
- `BedrockAgentCoreApp.invocationHandler.process` returns an async generator; runtime wraps it as SSE. Yield
  `{ data: string }`.
- Do NOT add `Co-Authored-By` trailers referencing Claude or any AI assistant (per workspace `CLAUDE.md`).

---

## Commit log

Append a one-line entry per commit as you go. Newest at the bottom. Format: `<sha> — <phase>: <summary>`.

- `50a6cbd` — Phase 1: scaffold TypeScript language support (WIP checkpoint, schema + UI + validator + spec-mapper).
- `3417f9a` — Phase 0: add progress tracker doc (verification sweep results baked in).
- _(next commit goes here)_
