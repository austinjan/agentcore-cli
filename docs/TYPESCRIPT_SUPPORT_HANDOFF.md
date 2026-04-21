# TypeScript (Strands) support — work-in-progress handoff

This file captures the state of an in-progress initiative to add TypeScript (Strands SDK) as a first-class language
option in `agentcore create`, alongside Python.

**Full plan:** `~/.claude/plans/lets-add-typescript-to-jazzy-honey.md` (owner machine only; copy the plan content into
this file if it needs to travel — it already lives in the git history of the original chat thread.)

## What's been merged in this checkpoint

All changes typecheck clean (`npx tsc --noEmit` from the `agentcore-cli/` directory).

1. **Schema constants** (`src/schema/constants.ts`)
   - `DEFAULT_NODE_VERSION: NodeRuntime = 'NODE_22'`
   - `DEFAULT_ENTRYPOINT_BY_LANGUAGE: Record<'Python' | 'TypeScript', string>`
   - `DEFAULT_RUNTIME_BY_LANGUAGE: Record<'Python' | 'TypeScript', RuntimeVersion>`

2. **UI unblock** (`src/cli/tui/screens/agent/types.ts`)
   - TypeScript entry in `LANGUAGE_OPTIONS` is no longer `disabled: true`.

3. **CLI validator** (`src/cli/commands/add/validate.ts`)
   - Removed the hard reject of `--language TypeScript`.
   - Added a new gate: when `language === 'TypeScript'`, only `Strands` is accepted as `--framework`; every other
     framework returns a clear error.

4. **CLI flag help** (`src/cli/commands/create/command.tsx`)
   - `--language` description now mentions both Python and TypeScript.

5. **TUI framework filter** (`src/cli/tui/screens/generate/types.ts` + `GenerateWizardUI.tsx`)
   - `getSDKOptionsForProtocol(protocol, language?)` takes an optional language arg.
   - When `language === 'TypeScript'` the list is filtered down to `Strands` only.
   - `GenerateWizardUI` passes `wizard.config.language` into the call site.

6. **Language-aware spec defaults** (`src/cli/operations/agent/generate/schema-mapper.ts`)
   - `mapGenerateConfigToAgent` now branches on `config.language === 'TypeScript'`:
     - `entrypoint` → `DEFAULT_ENTRYPOINT_BY_LANGUAGE.TypeScript` (`main.ts`)
     - `runtimeVersion` → `DEFAULT_RUNTIME_BY_LANGUAGE.TypeScript` (`NODE_22`)
   - Imports added from `'../../../../schema'` barrel.

## What is NOT done yet (the big chunks)

Tackling the remaining items requires a fresh context budget and ideally the actual Strands TS SDK and the AgentCore
runtime TS SDK installed locally for quick iteration.

### 1. Template assets (the bulk of the work)

Author files at `src/assets/typescript/http/strands/`:

```
base/
  gitignore.template
  package.json                 # Handlebars — pins @strands-agents/sdk + bedrock-agentcore
  tsconfig.json                # target ES2022, module NodeNext, strict
  main.ts                      # entrypoint — BedrockAgentCoreApp + Agent.stream()
  README.md
  mcp_client/client.ts         # mirrors Python mcp_client/client.py semantics
  model/load.ts                # mirrors Python model/load.py (per-provider branches)
capabilities/
  memory/session.ts            # mirrors Python capabilities/memory/session.py
```

**Confirmed SDK surface** (tarballs unpacked under `/tmp/strands-ts-check/` and `/tmp/bac-check/` in my session —
re-fetch with `npm pack` to inspect):

- `@strands-agents/sdk@1.0.0-rc.4`
  - Main: `Agent`, `tool`, `BedrockModel`, `McpClient`
  - Provider subpaths: `@strands-agents/sdk/models/{bedrock,anthropic,openai,google}`
  - MCP: `McpClient` takes `{ transport }` — `Transport` from `@modelcontextprotocol/sdk/shared/transport.js`
  - Agent streaming: `agent.stream(input)` yields `AgentStreamEvent`; filter for `ContentBlockDelta` with `textDelta`
    blocks to stream text output
- `bedrock-agentcore@0.2.2`
  - `BedrockAgentCoreApp` from `bedrock-agentcore/runtime` (Fastify-based, runs on 8080)
  - Identity HOFs `withAccessToken` / `withApiKey` from `bedrock-agentcore/identity`

**Template shape for `main.ts`** (sketch; not committed):

```ts
import { BedrockAgentCoreApp } from 'bedrock-agentcore/runtime';
import { Agent, tool } from '@strands-agents/sdk';
import { BedrockModel } from '@strands-agents/sdk/models/bedrock';
import { loadModel } from './model/load.js';
{{#if hasMemory}}import { getMemorySessionManager } from './memory/session.js';{{/if}}

const app = new BedrockAgentCoreApp({
  invocationHandler: {
    process: async function* (request, context) {
      const agent = new Agent({ model: loadModel(), /* sessionManager, tools */ });
      for await (const event of agent.stream((request as { prompt: string }).prompt)) {
        if (event.type === 'contentBlockDelta' && event.delta.type === 'textDelta') {
          yield { data: event.delta.text };
        }
      }
    },
  },
});
app.run();
```

Verify this against the actual SDK event shape before finalizing — the `stream()` event type names are in
`/tmp/strands-ts-check/package/dist/src/models/streaming.d.ts`.

### 2. Container template

Under `src/assets/container/typescript/`:

- `Dockerfile` — base `public.ecr.aws/docker/library/node:22-slim`; copy `package.json` + `package-lock.json`,
  `npm ci --omit=dev`, copy source, run `npx tsx main.ts` (or `tsc` build step + `node dist/main.js` if we want a build
  artifact). Expose 8080.
- `dockerignore.template` — `node_modules`, `dist`, `.env*`, `.git/`.

### 3. Dev server unblock

`src/cli/operations/dev/config.ts:49-54` — the `isDevSupported` function actively rejects non-Python agents with "Dev
mode only supports Python agents." Remove that guard; the actual `codezip-dev-server.ts` already handles `!isPython` via
`npx tsx watch`.

### 4. Node setup helper + wiring

- New `src/cli/operations/node/setup.ts` mirroring `src/cli/operations/python/setup.ts` — exposes
  `setupNodeProject({ projectDir })` that shells out to `npm install`.
- Wire into `src/cli/tui/screens/create/useCreateFlow.ts` around line 431 with a branch parallel to the Python setup
  block.
- Extend `checkCreateDependencies({ language })` in `src/cli/external-requirements/checks.ts` (called from
  `src/cli/commands/create/action.ts`) to verify `node` + `npm` when `language === 'TypeScript'`.

### 5. Packaging dispatcher (verified — no change required)

`src/lib/packaging/index.ts` already delegates to `NodeCodeZipPackager` when `isNodeRuntime(runtimeVersion)` is true.
Confirmed by reading — keep as-is.

### 6. Tests

- **Snapshots.** `src/assets/__tests__/assets.snapshot.test.ts` already has a TypeScript block (lines 106-120) that
  auto-discovers `typescript/` files. After authoring templates, run `npm run test:update-snapshots` and review.
- **Create integ test.** `integ-tests/create-with-agent.test.ts` — duplicate the Python block for TypeScript, assert
  `app/<name>/main.ts`, `package.json`, and `agentcore.json` has `runtimeVersion: NODE_22` + `entrypoint: main.ts`.
- **Dev-server test.** `src/cli/operations/dev/__tests__/codezip-dev-server.test.ts` — add a TS variant asserting
  `getSpawnConfig()` returns `{ cmd: 'npx', args: ['tsx', 'watch', 'main.ts'], ... }`.
- **TUI harness walkthrough** mirroring an existing Python walkthrough under `integ-tests/tui/`.
- **E2E container deploy test.** `integ-tests/deploy-typescript-strands-container.test.ts`: scaffold → container build →
  `agentcore deploy` against test account 325335451438 (per root CLAUDE.md, use `AWS_PROFILE=deploy`) →
  `agentcore invoke --prompt "ping"` → teardown. Gate behind the same env flag used by other AWS integ tests so CI
  without credentials skips cleanly.

### 7. Documentation

- `docs/frameworks.md` — add a "Supported languages" section.
- `docs/local-development.md` — TS dev loop (Node ≥ 18, `npx tsx watch`).
- `docs/commands.md` — `--language TypeScript` examples.
- `docs/container-builds.md` — TS Dockerfile example.
- `README.md` — one-line mention.

## Verification plan (when templates are done)

Refer to the full plan's section "Verification plan" — step-by-step from scratch-dir `agentcore create my-ts-agent`
through `agentcore dev`, `agentcore invoke`, and the container deploy + teardown. AWS account for deploys:
`325335451438` via `AWS_PROFILE=deploy`, per the workspace root CLAUDE.md.

## Out of scope

- LangChain/LangGraph, GoogleADK, OpenAIAgents templates for TypeScript.
- A2A and MCP protocol templates for TypeScript.
- pnpm / yarn support.
- BYO TypeScript path (already works today via `--type byo`).

## Known gotchas

- The Strands TS SDK is at `1.0.0-rc.4` (4 days old at time of writing). Pin exactly, and re-check the version +
  event-type names before release.
- `BedrockAgentCoreApp` in the TS SDK is Fastify-based, not ASGI — no uvicorn equivalent needed, but the dev-server code
  uses `npx tsx watch` which restarts the whole process on edits. Dev-experience parity with Python's uvicorn `--reload`
  is good enough.
- The `isDevSupported` Python-only guard is easy to miss — remember to remove it.
- `BedrockAgentCoreApp.invocationHandler.process` can return an async generator; the runtime wraps it in SSE
  automatically. The Python `@app.entrypoint async def invoke` equivalent on the TS side is yielding `{ data: string }`
  objects from that generator.
