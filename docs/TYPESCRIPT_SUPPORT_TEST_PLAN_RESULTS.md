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

- Tester: Jesse Turner (automated run via Claude Code)
- Date: 2026-04-22
- CLI version (`agentcore --version`): 0.9.1-1776883713 (freshly bundled + installed from the branch under test)
- Branch / commit SHA: master @ 71ebf27060266c2a60b27e554af43219706e94fd
- Node version (`node --version`; must be ≥ 20): v20.19.4
- npm version (`npm --version`): 10.8.2
- Platform (macOS / Linux): Linux (amzn2int kernel 5.10.252)

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

- [x] Node 20 or later installed (`node --version`). → v20.19.4.
- [x] npm on PATH (`npm --version`). → 10.8.2.
- [x] git on PATH (`git --version`). → 2.47.3.
- [~] Docker / Podman / Finch installed **only** if you plan to run the Container section below. Note: container
  build/deploy (Section 7.1–7.3) skipped in this run; Dockerfile + `.dockerignore` inspection still performed.
- [x] For deploy tests: `AWS_PROFILE=deploy` credentials fresh. Ran
      `ada credentials update --account 325335451438     --provider isengard --role Admin --profile deploy --once`
      (exit 0) at the start of the run.
- [x] Working from a clean scratch directory (`~/ts-test`). Existing test dirs removed between steps as needed.

---

## 1 — Automated regression suites

Run these first. If either fails, stop and escalate — the manual steps below will not be meaningful.

- [x] `npm run test:unit` passes (run from the `agentcore-cli/` repo). Exit 0. Full coverage summary printed; no
      failures in the Vitest pass.
- [x] `npm run test:integ` passes (run from the `agentcore-cli/` repo). 129 tests expected. Observed **18 files / 129
      passed** in 42.49s, exit 0. The
      `integration: create with TypeScript agent > scaffolds a TypeScript Strands     agent with main.ts entrypoint`
      test passed explicitly.

---

## 2 — CLI validator (no side effects)

These run against the installed CLI and do not write anything meaningful — they just confirm argument validation.

### 2.1 TypeScript + Strands is accepted

```bash
agentcore create --name TsValidOk --language TypeScript --framework Strands --model-provider Bedrock --memory none --dry-run
```

- [!] Exit code 0 (pass). **BUT** the dry-run preview does **not** list a TypeScript Strands agent with
  `entrypoint: main.ts` / `runtimeVersion: NODE_22`. Observed preview only listed the project skeleton
  (`agentcore/project.json`, `aws-targets.json`, `.env.local`, `cdk/`) and stopped — no `app/TsValidOk/main.ts` line was
  emitted, whereas the Python dry-run (2.3) _does_ list `app/PyRegression/main.py` and `pyproject.toml`. The actual
  scaffold in §3 produces the correct `main.ts` + `NODE_22` config, so this is a dry-run preview omission, not a runtime
  shape bug. **Fix pointer:** the dry-run list-builder that walks language branches to enumerate app files — likely in
  the create wizard / `useCreateFlow` dry-run path — is missing the TS branch that lists `main.ts`, `package.json`,
  `tsconfig.json`, `mcp_client/client.ts`, `model/load.ts`.

### 2.2 TypeScript + non-Strands is rejected with a clear message

```bash
agentcore create --name TsBadFw --language TypeScript --framework LangChain_LangGraph --model-provider Bedrock --memory none --dry-run
```

- [x] Exit code 1. Error:
      `Framework LangChain_LangGraph is not yet available for TypeScript. Only Strands is     supported.` Contains the
      expected phrase and names the framework.

```bash
agentcore create --name TsBadFw2 --language TypeScript --framework GoogleADK --model-provider Gemini --memory none --dry-run
```

- [x] Exit code 1. Error: `Framework GoogleADK is not yet available for TypeScript. Only Strands is supported.`

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

- [x] Exit code 0. Preview lists `app/PyRegression/main.py` and `app/PyRegression/pyproject.toml`. No TypeScript-related
      errors. (Note: the dry-run preview lists app source files for Python but not for TS — see 2.1 for the TS gap.)

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

- [x] `app/MyTsAgent/main.ts` exists.
- [x] `app/MyTsAgent/package.json` exists and pins `@strands-agents/sdk@1.0.0-rc.4` and `bedrock-agentcore@0.2.2`.
      Verified exact pins in the generated file.
- [x] `app/MyTsAgent/tsconfig.json` exists.
- [x] `app/MyTsAgent/model/load.ts` exists.
- [x] `app/MyTsAgent/mcp_client/client.ts` exists.
- [x] `app/MyTsAgent/.gitignore` exists and lists `node_modules/` + `dist/`.
- [!] `app/MyTsAgent/node_modules/` does **not** exist after `agentcore create` (no `--skip-install` flag was passed).
  Running `npm install` manually in `app/MyTsAgent/` **fails with ERESOLVE** because the pinned combo
  (`@strands-agents/sdk@1.0.0-rc.4` + `bedrock-agentcore@0.2.2`) has a peerOptional conflict:
  `peerOptional @strands-agents/sdk@">=0.1.0"` resolves to `@strands-agents/sdk@0.7.0`, conflicting with the pinned
  `1.0.0-rc.4`. `npm install --legacy-peer-deps` succeeds, but the resulting tree is missing `@opentelemetry/api`, which
  `@strands-agents/sdk` requires at runtime (see §4 dev-server failure). **Fix pointers:** -
  `src/cli/operations/node/setup.ts` — either skips install silently, or throws and the create flow swallows the error.
  Verify it runs, captures failure, and either surfaces a clear diagnostic or applies `--legacy-peer-deps` automatically
  for this known-conflicting pin combo. - Template `src/assets/typescript/http/strands/base/package.json.hbs` — either
  bump `bedrock-agentcore` to a version compatible with `@strands-agents/sdk@1.0.0-rc.4`, or add `@opentelemetry/api` as
  a direct dep so `--legacy-peer-deps` installs produce a runnable tree.

### 3.2 Config shape

Open `agentcore/agentcore.json` and confirm:

- [x] `runtimes[0].entrypoint === "main.ts"`.
- [x] `runtimes[0].runtimeVersion === "NODE_22"`.
- [!] `runtimes[0].language === "TypeScript"`. **NOT PRESENT** — the generated `agentcore.json` runtime entry has no
  `language` field at all. Observed keys: `name`, `build`, `entrypoint`, `codeLocation`, `runtimeVersion`,
  `networkMode`, `protocol`.
- [!] `runtimes[0].framework === "Strands"`. **NOT PRESENT** — `framework` is also missing from the runtime entry. **Fix
  pointer:** `src/cli/operations/agent/generate/schema-mapper.ts` should emit `language`/`framework` on the runtime
  spec, and `src/schema/schemas/agent-env.ts` should allow/require them. If the plan's expectation of these fields was
  dropped intentionally, update the test plan; otherwise the mapper is dropping them.

### 3.3 git + CDK

- [x] `.git/` exists at the project root.
- [x] `agentcore/cdk/node_modules/` exists (CDK deps installed successfully).

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

- [x] Server attempts to start via the TS branch. `ps` showed `npm exec tsx watch main.ts` and the nested
      `tsx watch main.ts` node process spawned — **not** `uvicorn`. The CLI banner prints
      `Agent: MyTsAgent / Server: http://localhost:8080/invocations`.
- [!] Did **not** bind on port 8080. `ss -tln | grep 8080` returned nothing; `tsx` crashed at startup. First crash
  (pre-install): `ERR_MODULE_NOT_FOUND: Cannot find package 'bedrock-agentcore'` (npm install never ran during
  `agentcore create`, see §3.1). Second crash (post `npm install --legacy-peer-deps`):
  `ERR_MODULE_NOT_FOUND: Cannot find package     '@opentelemetry/api'` imported from
  `@strands-agents/sdk/dist/src/mcp.js`. No EADDRINUSE errors (the port was never reached).
- [x] No "TypeScript is not yet supported" error. The dev gate accepted TS; crashes are from the dependency tree, not
      from a Python-only guard.

In another terminal, from inside `MyTsAgent/`:

```bash
agentcore dev "Hello, who are you?"
```

- [~] Blocked — server never bound on 8080 (see above). `agentcore dev "Hello, who are you?"` returned
  `Error: Dev server not running on port 8080`. Cannot be exercised until the install / dependency issues in §3.1 are
  resolved.

```bash
agentcore dev "Tell me a short joke" --stream
```

- [~] Blocked — depends on the non-streaming invoke succeeding. Same root cause as above.

### 4.1 Hot reload

With the dev server still running, edit `app/MyTsAgent/main.ts` (e.g. tweak the system prompt or add a `console.log`)
and save.

- [~] Blocked — server never reached steady state. The `tsx watch` wiring is present and spawned correctly; hot reload
  cannot be demonstrated end-to-end until the dep tree issue is fixed.

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

- [x] Exit code 1. Error:
      `Framework LangChain_LangGraph is not yet available for TypeScript. Only Strands is     supported.`

```bash
agentcore add agent --name TsGoodAgent --language TypeScript --framework Strands --model-provider Bedrock --memory none
```

- [x] Exit code 0. Output: `Added agent 'TsGoodAgent'` and `Agent code: .../app/TsGoodAgent`.
- [x] `agentcore/agentcore.json` now lists two runtimes: `MyTsAgent` and `TsGoodAgent`, both with `entrypoint: main.ts`
      and `runtimeVersion: NODE_22`. (Same `language`/`framework` fields missing as in §3.2.) Cleanup:
      `agentcore remove agent --name TsGoodAgent -y` succeeded (`success: true`).

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

- [~] Skipped in this run. Rationale: local dev cannot even boot the TS runtime (§4), so pushing a broken bundle to AWS
  would burn a CodeBuild cycle without being able to validate it. Deploy should be retried once §3.1 / dependency pins
  are fixed. AWS creds were refreshed successfully, so the blocker is purely upstream.
- [~] Skipped.

```bash
AWS_PROFILE=deploy agentcore status
```

- [~] Skipped — deploy not attempted.

```bash
AWS_PROFILE=deploy agentcore invoke "ping"
```

- [~] Skipped — deploy not attempted.

```bash
AWS_PROFILE=deploy agentcore invoke "Tell me a short joke" --stream
```

- [~] Skipped — deploy not attempted.

### 6.1 Teardown

```bash
AWS_PROFILE=deploy agentcore remove all -y
```

- [~] Skipped — nothing was deployed, so no teardown needed.

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

- [x] `Dockerfile` exists and uses `public.ecr.aws/docker/library/node:22-slim`, adds a `bedrock_agentcore` user
      (`useradd -m -u 1000 bedrock_agentcore`) and switches to it with `USER bedrock_agentcore`, CMD is
      `["npx", "tsx", "main.ts"]`, exposes 8080/8000/9000 per the runtime service contract.
- [x] `.dockerignore` exists and excludes `node_modules/`, `dist/`, `.env`, `.env.*`, `.git/`, plus coverage,
      `.agentcore/artifacts/`, `*.zip`, IDE dirs, and common log files.

### 7.1 Local package

```bash
agentcore package
```

- [~] Skipped — container runtime not exercised in this pass (Docker/Podman/Finch not invoked). The generated
  `Dockerfile` would inherit the same `--legacy-peer-deps` / `@opentelemetry/api` issue as the CodeZip path at
  `npm ci --omit=dev` time, so a clean-room build would likely need template fixes first.

### 7.2 Local dev with container

```bash
agentcore dev --logs
```

- [~] Skipped.

```bash
agentcore dev "hello"
```

- [~] Skipped.

Stop the dev server.

### 7.3 Container deploy (optional)

```bash
AWS_PROFILE=deploy agentcore deploy -y
```

- [~] Skipped.

```bash
AWS_PROFILE=deploy agentcore invoke "ping"
```

- [~] Skipped.

```bash
AWS_PROFILE=deploy agentcore remove all -y
```

- [~] Skipped.

**Fix pointers if Section 7 fails:**

- Wrong Dockerfile (base image, user, entrypoint, ports) → `src/assets/container/typescript/Dockerfile`.
- `.dockerignore` missing entries → `src/assets/container/typescript/dockerignore.template`.
- Image over 1 GB → trim `dockerignore.template` or revisit multi-stage build in the Dockerfile.
- Snapshot drift → run `npm run test:update-snapshots` after intentional edits; snapshot lives at
  `src/assets/__tests__/__snapshots__/assets.snapshot.test.ts.snap`.

---

## 8 — Docs smoke test

Open each file and confirm TS examples render correctly and copy-paste cleanly.

- [x] `docs/frameworks.md` — Supported-languages table row:
      `| TypeScript | Strands only | Node 22 | Uses npm + tsx     for the dev loop. Other frameworks are not yet available in TS. |`
      and a paragraph telling users to pass `--language TypeScript`.
- [x] `docs/local-development.md` — `### TypeScript Agents` subsection at line 45, calls out `npx tsx watch main.ts`.
- [x] `docs/commands.md` — `--language` rows mention TypeScript (lines 81, 211, 368). TS create example at lines 54–57.
- [x] `docs/container-builds.md` — `### TypeScript Dockerfile` subsection with `node:22-slim` reference and
      `agentcore.json` example at lines 51–61.
- [x] `README.md` — line 67: `| Strands Agents | AWS-native, streaming support (Python + TypeScript) |`.

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

- [x] Python agent scaffolded successfully. `agentcore dev --logs` shows Uvicorn output:
      `Will watch for changes in these directories: ['.../PyCheck/app/PyCheck']` and
      `Uvicorn running on     http://127.0.0.1:8080` — **not** `tsx`. `agentcore dev "hello"` returned
      `Hello! How can I help you today?`. Python regression is clean; the TS branch is isolated.

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

---

## Run summary (2026-04-22, commit 71ebf27)

### What passed (green path)

- Automated suites: `test:unit` + `test:integ` (129/129) both green.
- Validator gating: TS + Strands accepted; TS + LangChain_LangGraph and TS + GoogleADK cleanly rejected with a
  framework-aware error; Python regression unaffected. Same gating observed in `agentcore add agent` (§5).
- Scaffold shape: `main.ts`, `package.json` (correct pins), `tsconfig.json`, `mcp_client/client.ts`, `model/load.ts`,
  `.gitignore` all generated; `.git/` + CDK `node_modules/` present; runtime entry has the right `entrypoint` and
  `runtimeVersion`. Container scaffold emits a correct `Dockerfile` (node:22-slim, non-root user, `npx tsx main.ts`) and
  an appropriate `.dockerignore`.
- Dev-server plumbing: the old "TypeScript is not yet supported" guard is gone; `agentcore dev` enters the TS branch and
  spawns `tsx watch main.ts`.
- Docs: every file called out in §8 contains the expected TS content.
- Python regression: full Python dev-server smoke works end-to-end (uvicorn on 8080, invoke returns a response).

### Blockers found (must-fix before shipping)

1. **TS dependency pin is unresolvable out of the box.** `npm install` in a freshly-scaffolded TS project fails with
   ERESOLVE: `bedrock-agentcore@0.2.2`'s `peerOptional @strands-agents/sdk@">=0.1.0"` resolves to `0.7.0`, which
   conflicts with the template-pinned `@strands-agents/sdk@1.0.0-rc.4`. `agentcore create` leaves no `node_modules/`
   behind (§3.1). Until this is fixed, TS users have a broken-on-first-run experience.
   - Fix: update either the `bedrock-agentcore` pin or the `@strands-agents/sdk` pin in
     `src/assets/typescript/http/strands/base/package.json.hbs` so the trees agree; or document `--legacy-peer-deps` and
     install it that way from `src/cli/operations/node/setup.ts`.
2. **Runtime deps still incomplete under `--legacy-peer-deps`.** Even with the peer override, `tsx` crashes on startup
   with `Cannot find package '@opentelemetry/api' imported from @strands-agents/sdk/dist/src/mcp.js`. Add
   `@opentelemetry/api` as a direct dep in the template `package.json` (and any other transitives the SDK expects at
   runtime rather than as peers).
3. **`agentcore.json` runtime entry is missing `language` and `framework`.** The test plan expects both; scaffolder
   emits only `name`, `build`, `entrypoint`, `codeLocation`, `runtimeVersion`, `networkMode`, `protocol`. Either the
   mapper in `src/cli/operations/agent/generate/schema-mapper.ts` is dropping them or the schema in
   `src/schema/schemas/agent-env.ts` needs to accept them and the plan's expectation is the current contract.
4. **TS dry-run preview is empty of app files.** The Python dry-run lists `app/<name>/main.py` + `pyproject.toml`; the
   TS dry-run stops at `cdk/` and never shows the TS app files. Cosmetic but a regression vs. the Python preview, and
   the plan expected the preview to name `main.ts` + `NODE_22`.

### Skipped (not blocked on TS code — blocked on #1/#2 above)

- Section 6 (CodeZip deploy + invoke) and Section 7.1–7.3 (container build, local+deployed container invoke, container
  teardown). Rerun once the dependency tree boots locally. Scaffold and Dockerfile inspection were still covered.

### Recommendation

Ship the framework-gate / scaffold / docs / dev-gate changes as-is — they are clean. Block the release on fixing the
template dependency pins (#1 + #2) and restoring `language`/`framework` in `agentcore.json` (#3). Once those land, rerun
§§ 3.1, 4, 6, 7.1–7.3 end-to-end on `AWS_PROFILE=deploy`.
