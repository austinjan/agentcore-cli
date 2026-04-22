# TypeScript (Strands) support — manual test plan

Hands-on verification checklist for TypeScript agent support. Work top-to-bottom. Each step has explicit commands, an
expected outcome, and a status box. Record results inline (`[x]` pass, `[!]` fail + note, `[~]` partial / skipped).

**Scope:** TypeScript + Strands HTTP agents. Other frameworks (LangChain, CrewAI, GoogleADK, OpenAIAgents) in TS are
explicitly out of scope and should reject.

**AWS test account:** `325335451438` via `AWS_PROFILE=deploy`. Refresh with:

```bash
ada credentials update --account 325335451438 --provider isengard --role Admin --profile deploy --once
```

**Test run metadata** (fill these in as you go):

- Tester:
- Date:
- CLI version (`agentcore --version`):
- Branch / commit SHA:
- Node version (`node --version`; must be ≥ 20):
- npm version (`npm --version`):
- Platform (macOS / Linux):

---

## Legend

- `[ ]` not run yet
- `[x]` pass
- `[!]` fail — add a note line beneath the step
- `[~]` partial / skipped — add a note line

---

## Code map (where to look when something breaks)

Each numbered section below lists the files it exercises so fixes can be made quickly. This map is the full picture —
bookmark it.

| Concern                              | Primary source                                                                                        | Tests                                                                                |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `create` validator (TS/Strands gate) | `src/cli/commands/create/validate.ts`                                                                 | `src/cli/commands/create/__tests__/validate.test.ts`                                 |
| `add agent` validator                | `src/cli/commands/add/validate.ts`                                                                    | `src/cli/commands/add/__tests__/validate.test.ts`                                    |
| `--language TypeScript` CLI help     | `src/cli/commands/create/command.tsx`                                                                 | —                                                                                    |
| Language/runtime defaults            | `src/schema/constants.ts`                                                                             | `src/schema/__tests__/constants.test.ts`                                             |
| Spec shape (entrypoint/runtimeVer)   | `src/cli/operations/agent/generate/schema-mapper.ts`                                                  | `src/cli/operations/agent/generate/__tests__/schema-mapper.test.ts`                  |
| TS template assets                   | `src/assets/typescript/http/strands/**`                                                               | `src/assets/__tests__/assets.snapshot.test.ts`                                       |
| TS container Dockerfile              | `src/assets/container/typescript/**`                                                                  | `src/assets/__tests__/assets.snapshot.test.ts`                                       |
| Node setup (npm install on scaffold) | `src/cli/operations/node/setup.ts`                                                                    | `src/cli/operations/node/__tests__/setup.test.ts`                                    |
| Create-flow wiring (TUI)             | `src/cli/tui/screens/create/useCreateFlow.ts`                                                         | `integ-tests/tui/create-typescript-strands.test.ts`                                  |
| TUI language/framework filtering     | `src/cli/tui/screens/agent/types.ts`, `src/cli/tui/screens/generate/types.ts`, `GenerateWizardUI.tsx` | —                                                                                    |
| Dev-server gate                      | `src/cli/operations/dev/config.ts`                                                                    | `src/cli/operations/dev/__tests__/config.test.ts`                                    |
| Dev-server spawn (tsx watch)         | `src/cli/operations/dev/codezip-dev-server.ts`                                                        | `src/cli/operations/dev/__tests__/codezip-dev-server.test.ts`                        |
| Packaging dispatcher (Node branch)   | `src/lib/packaging/index.ts`, `src/lib/packaging/node.ts`                                             | `src/lib/packaging/__tests__/node.test.ts`                                           |
| Create integ (scaffold smoke)        | —                                                                                                     | `integ-tests/create-with-agent.test.ts`                                              |
| Non-Strands rejection                | —                                                                                                     | `src/cli/commands/add/__tests__/add-agent.test.ts`, `add/__tests__/validate.test.ts` |

Companion docs: `docs/TYPESCRIPT_SUPPORT_PROGRESS.md` (what was built, commit-by-commit) and
`docs/TYPESCRIPT_SUPPORT_HANDOFF.md` (prose background + SDK surface notes).

---

## 0 — Prerequisites

- [ ] Node 20 or later installed (`node --version`).
- [ ] npm on PATH (`npm --version`).
- [ ] git on PATH (`git --version`).
- [ ] Docker / Podman / Finch installed **only** if you plan to run the Container section below.
- [ ] For deploy tests: `AWS_PROFILE=deploy` credentials fresh (re-run the `ada credentials update` command above if
      unsure).
- [ ] Working from a clean scratch directory (`mkdir ~/ts-test && cd ~/ts-test`). All commands below assume you are
      inside this scratch dir.

---

## 1 — Automated regression suites

Run these first. If either fails, stop and escalate — the manual steps below will not be meaningful.

- [ ] `npm run test:unit` passes (run from the `agentcore-cli/` repo).
- [ ] `npm run test:integ` passes (run from the `agentcore-cli/` repo). 129 tests expected.

---

## 2 — CLI validator (no side effects)

These run against the installed CLI and do not write anything meaningful — they just confirm argument validation.

### 2.1 TypeScript + Strands is accepted

```bash
agentcore create --name TsValidOk --language TypeScript --framework Strands --model-provider Bedrock --memory none --dry-run
```

- [ ] Exit code 0. Dry-run preview lists a TypeScript Strands agent with `entrypoint: main.ts` and
      `runtimeVersion: NODE_22`.

### 2.2 TypeScript + non-Strands is rejected with a clear message

```bash
agentcore create --name TsBadFw --language TypeScript --framework LangChain_LangGraph --model-provider Bedrock --memory none --dry-run
```

- [ ] Exit code non-zero. Error message contains "is not yet available for TypeScript" and names `LangChain_LangGraph`.

```bash
agentcore create --name TsBadFw2 --language TypeScript --framework GoogleADK --model-provider Gemini --memory none --dry-run
```

- [ ] Same behavior — clear rejection naming the framework.

**Fix pointers if 2.1 / 2.2 fail:**

- TS-is-rejected or wrong error text → `src/cli/commands/create/validate.ts` (the Strands-only gate). Keep it in
  lockstep with `src/cli/commands/add/validate.ts`.
- Dry-run preview shows wrong entrypoint / runtime → `src/cli/operations/agent/generate/schema-mapper.ts` (the
  language-branch for `entrypoint` and `runtimeVersion`) and the defaults in `src/schema/constants.ts`.
- Tests: `src/cli/commands/create/__tests__/validate.test.ts` and `src/cli/commands/add/__tests__/validate.test.ts`.

### 2.3 Python regression unaffected

```bash
agentcore create --name PyRegression --language Python --framework Strands --model-provider Bedrock --memory none --dry-run
```

- [ ] Exit code 0. Preview shows a Python agent with `main.py` and `PYTHON_*` runtime. No TypeScript-related errors.

---

## 3 — Scaffold a TypeScript project

Use a real filesystem run; keep the directory around for the later steps.

```bash
agentcore create \
  --name MyTsAgent \
  --language TypeScript \
  --framework Strands \
  --model-provider Bedrock \
  --memory none
cd MyTsAgent
```

### 3.1 Files generated

- [ ] `app/MyTsAgent/main.ts` exists.
- [ ] `app/MyTsAgent/package.json` exists and pins `@strands-agents/sdk@1.0.0-rc.4` and `bedrock-agentcore@0.2.2`.
- [ ] `app/MyTsAgent/tsconfig.json` exists.
- [ ] `app/MyTsAgent/model/load.ts` exists.
- [ ] `app/MyTsAgent/mcp_client/client.ts` exists.
- [ ] `app/MyTsAgent/.gitignore` exists and lists `node_modules` + `dist`.
- [ ] `app/MyTsAgent/node_modules/` exists (npm install ran as part of create unless you passed `--skip-install`).

### 3.2 Config shape

Open `agentcore/agentcore.json` and confirm:

- [ ] `runtimes[0].entrypoint === "main.ts"`.
- [ ] `runtimes[0].runtimeVersion === "NODE_22"`.
- [ ] `runtimes[0].language === "TypeScript"`.
- [ ] `runtimes[0].framework === "Strands"`.

### 3.3 git + CDK

- [ ] `.git/` exists at the project root.
- [ ] `agentcore/cdk/node_modules/` exists.

**Fix pointers if Section 3 fails:**

- Missing or wrong-shaped TS template files → `src/assets/typescript/http/strands/base/*` (the Handlebars templates:
  `main.ts`, `package.json`, `tsconfig.json`, `mcp_client/client.ts`, `model/load.ts`, `gitignore.template`). Run
  `npm run test:update-snapshots` after intentional template edits.
- `agentcore.json` shows `main.py` / `PYTHON_*` for a TS scaffold → `src/cli/operations/agent/generate/schema-mapper.ts`
  (the language-branch should return `main.ts` / `NODE_22`) and `src/schema/constants.ts`
  (`DEFAULT_ENTRYPOINT_BY_LANGUAGE`, `DEFAULT_RUNTIME_BY_LANGUAGE`, `DEFAULT_NODE_VERSION`).
- `node_modules/` missing → `src/cli/operations/node/setup.ts` (the `npm install` shell-out; respects
  `AGENTCORE_SKIP_INSTALL`). Also `src/cli/tui/screens/create/useCreateFlow.ts` for the wiring that calls it.
- Create integ smoke covers this exact path: `integ-tests/create-with-agent.test.ts` (the
  `describe('integration: create with TypeScript agent', ...)` block).

---

## 4 — Local dev server (CodeZip)

From inside `MyTsAgent/`:

```bash
agentcore dev --logs
```

- [ ] Server starts. Log output shows `npx tsx watch main.ts` (or equivalent) being spawned — **not** `uvicorn`.
- [ ] Binds on port 8080 (default). No EADDRINUSE errors.
- [ ] No "TypeScript is not yet supported" error anywhere.

In another terminal, from inside `MyTsAgent/`:

```bash
agentcore dev "Hello, who are you?"
```

- [ ] Receives a non-empty response. (Bedrock creds must be configured for the shell running the dev server.)

```bash
agentcore dev "Tell me a short joke" --stream
```

- [ ] Response streams incrementally rather than arriving as a single blob.

### 4.1 Hot reload

With the dev server still running, edit `app/MyTsAgent/main.ts` (e.g. tweak the system prompt or add a `console.log`)
and save.

- [ ] Dev server logs show `tsx` reloading; subsequent `agentcore dev "ping"` uses the new code. No manual restart
      needed.

Stop the dev server (Ctrl+C).

**Fix pointers if Section 4 fails:**

- "TypeScript is not yet supported" error from `agentcore dev` → stale Python-only guard in
  `src/cli/operations/dev/config.ts` (`isDevSupported`). TS must pass through; downstream branches on entrypoint
  extension.
- Dev server spawns `uvicorn` instead of `tsx` for TS, or mangles the entrypoint to `main/ts.ts` → non-Python branch of
  `src/cli/operations/dev/codezip-dev-server.ts` (spawn args). Entry file must be passed literally — do not apply
  Python-style module-path rewriting.
- Hot reload not triggering → `tsx watch` args in the same file. Covered by the TS spec in
  `src/cli/operations/dev/__tests__/codezip-dev-server.test.ts`.

---

## 5 — Non-Strands rejection on `add agent`

Still inside `MyTsAgent/`:

```bash
agentcore add agent --name TsBadAgent --language TypeScript --framework LangChain_LangGraph --model-provider Bedrock --memory none
```

- [ ] Exit code non-zero. Clear error mentioning TypeScript is only available for Strands today.

```bash
agentcore add agent --name TsGoodAgent --language TypeScript --framework Strands --model-provider Bedrock --memory none
```

- [ ] Exit code 0. New TypeScript agent scaffolded under `app/TsGoodAgent/`.
- [ ] `agentcore/agentcore.json` now lists two TS runtimes.

(Remove the extra agent if you want a clean state for deploy: `agentcore remove agent --name TsGoodAgent -y`.)

**Fix pointers if Section 5 fails:**

- Non-Strands TS accepted (should reject) → `src/cli/commands/add/validate.ts` (search for the
  `TypeScript && framework !== 'Strands'` branch).
- Strands TS rejected (should accept) → same file; also confirm the TUI filter in `src/cli/tui/screens/agent/types.ts`
  and `src/cli/tui/screens/generate/types.ts`.
- Tests: `src/cli/commands/add/__tests__/validate.test.ts` and `src/cli/commands/add/__tests__/add-agent.test.ts`.

---

## 6 — CodeZip deploy + invoke

Requires fresh `AWS_PROFILE=deploy` credentials (see Prerequisites).

```bash
AWS_PROFILE=deploy agentcore deploy -y
```

- [ ] Deploy completes without CDK errors.
- [ ] `agentcore/.cli/deployed-state.json` now has a runtime ARN for `MyTsAgent`.

```bash
AWS_PROFILE=deploy agentcore status
```

- [ ] Runtime shows as `deployed` with `runtimeVersion: NODE_22`.

```bash
AWS_PROFILE=deploy agentcore invoke "ping"
```

- [ ] Returns a response. No cold-start errors related to Node / tsx.

```bash
AWS_PROFILE=deploy agentcore invoke "Tell me a short joke" --stream
```

- [ ] Response streams from the deployed runtime.

### 6.1 Teardown

```bash
AWS_PROFILE=deploy agentcore remove all -y
```

- [ ] All resources removed cleanly. `agentcore status` reports no deployed resources.

**Fix pointers if Section 6 fails:**

- CDK synth errors about `runtimeVersion` → the vended CDK project forwards `runtimeVersion` generically. Check the L3
  construct package `@aws/agentcore-cdk` (separate repo `aws/agentcore-l3-cdk-constructs`). No TS-specific code should
  be needed there; if it hardcodes `PYTHON_*`, that's the bug.
- CodeZip packaging fails for TS → `src/lib/packaging/index.ts` (dispatcher, `isNodeRuntime` branch) and
  `src/lib/packaging/node.ts`. Tests: `src/lib/packaging/__tests__/node.test.ts`.
- Deployed runtime fails to start → check CloudWatch logs; most likely the entrypoint or runtimeVersion is wrong in
  `agentcore.json` (see Section 3 fix pointers).

---

## 7 — Container build (optional, requires Docker/Podman/Finch)

Fresh scratch dir:

```bash
cd ~/ts-test
agentcore create \
  --name MyTsContainer \
  --language TypeScript \
  --framework Strands \
  --model-provider Bedrock \
  --memory none \
  --build Container
cd MyTsContainer
```

- [ ] `app/MyTsContainer/Dockerfile` exists, uses `public.ecr.aws/docker/library/node:22-slim`, runs as
      `bedrock_agentcore`, entrypoint is `npx tsx main.ts`.
- [ ] `app/MyTsContainer/.dockerignore` exists and excludes `node_modules`, `dist`, `.env*`, `.git/`.

### 7.1 Local package

```bash
agentcore package
```

- [ ] Container image builds successfully. Size is under the 1 GB limit.

### 7.2 Local dev with container

```bash
agentcore dev --logs
```

- [ ] Container starts. Hot-reload works when you edit `app/MyTsContainer/main.ts`.

```bash
agentcore dev "hello"
```

- [ ] Returns a non-empty response.

Stop the dev server.

### 7.3 Container deploy (optional)

```bash
AWS_PROFILE=deploy agentcore deploy -y
```

- [ ] CodeBuild builds the image remotely; deploy succeeds.

```bash
AWS_PROFILE=deploy agentcore invoke "ping"
```

- [ ] Deployed container responds.

```bash
AWS_PROFILE=deploy agentcore remove all -y
```

- [ ] Clean teardown.

**Fix pointers if Section 7 fails:**

- Wrong Dockerfile (base image, user, entrypoint, ports) → `src/assets/container/typescript/Dockerfile`.
- `.dockerignore` missing entries → `src/assets/container/typescript/dockerignore.template`.
- Image over 1 GB → trim `dockerignore.template` or revisit multi-stage build in the Dockerfile.
- Snapshot drift → run `npm run test:update-snapshots` after intentional edits; snapshot lives at
  `src/assets/__tests__/__snapshots__/assets.snapshot.test.ts.snap`.

---

## 8 — Docs smoke test

Open each file and confirm TS examples render correctly and copy-paste cleanly.

- [ ] `docs/frameworks.md` — "Supported languages" section lists TypeScript + Strands-only note.
- [ ] `docs/local-development.md` — "TypeScript Agents" subsection present with `npx tsx watch` detail.
- [ ] `docs/commands.md` — `--language` row on `create` mentions TypeScript; TS create example present.
- [ ] `docs/container-builds.md` — "TypeScript Dockerfile" subsection with node:22-slim + `agentcore.json` example.
- [ ] `README.md` — Strands row in the Supported Frameworks table annotates "(Python + TypeScript)".

---

## 9 — Python regression smoke

Run once at the end to catch any accidental Python-path breakage:

```bash
cd ~/ts-test
agentcore create --name PyCheck --language Python --framework Strands --model-provider Bedrock --memory none
cd PyCheck
agentcore dev --logs   # in one terminal
agentcore dev "hello"  # in another
```

- [ ] Python agent scaffolds, dev server uses `uvicorn` (not `tsx`), and `invoke` returns a response.

Teardown optional.

---

## Known limitations (expected failures — do not flag)

- `@strands-agents/sdk` is `1.0.0-rc.4`. If an upstream event-name or identity HOF changes, templates may need a pin
  bump. Note any runtime errors that look like "property X does not exist on event Y".
- AWS_IAM gateway auth is stubbed in the TS MCP client template — TS `mcp-proxy-for-aws` package is not yet wired.
  Non-IAM gateway auth paths should work.
- `--language TypeScript` is only valid with `--framework Strands`. Any other framework is an expected rejection.

---

## Failures — what to capture

If a step fails:

1. Record `[!]` next to the step and add a one-line summary.
2. Capture the full stderr + stdout.
3. Note the CLI version, Node version, platform, and whether `AGENTCORE_SKIP_INSTALL` was set.
4. If AWS-related: capture the runtime ARN / CloudFormation stack name from `deployed-state.json`.
5. File the issue against the tracker or link to the failing commit.
