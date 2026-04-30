# Harness Feature Bug Bash — `feat/harness-implementation`

**Branch:** `feat/harness-implementation`
**CLI Version:** 0.9.1
**Date:** 2026-04-22
**Environment:** `AGENTCORE_STAGE=beta`, `AWS_REGION=us-west-2`, Account: `409645756810`

---

## Summary

Comprehensive first-time-user CLI testing of all harness commands. Tested: `create`, `add harness`, `add tool`, `remove tool`, `remove harness`, `validate`, `deploy`, `status`, `invoke`, `logs`, `traces`, `fetch access`, and `dev`. Covered Bedrock, OpenAI, and Gemini providers.

**Total findings: 22** (9 bugs, 5 UX quirks, 4 missing features, 4 documentation gaps)

---

## Bugs

### BUG-001: `agentcore status` shows harness entry twice (P1)

**Severity:** High — affects every status check
**Repro:**
```bash
agentcore status
agentcore status --json
agentcore status --type harness --json
```
**Expected:** Harness appears once in output
**Actual:** Harness appears twice, both in text and JSON output. React warning: `Encountered two children with the same key, 'harness-deploytestbr'`
**JSON output shows duplicate:**
```json
"resources": [
  { "resourceType": "harness", "name": "deploytestbr", ... },
  { "resourceType": "harness", "name": "deploytestbr", ... }
]
```

---

### BUG-002: `aws-targets.json` not populated on harness `create` (P1)

**Severity:** High — deploy fails immediately after create
**Repro:**
```bash
agentcore create --name myproject --model-provider bedrock --skip-install --skip-git
cd myproject
agentcore deploy -y
# Error: Target "default" not found in aws-targets.json
```
**Expected:** `aws-targets.json` should be auto-populated with a default target (inferring account/region from current AWS credentials), or the create summary should tell the user to set it up.
**Actual:** `aws-targets.json` is empty `[]`. User must manually create the target entry, and the field name (`account` not `accountId`) is not documented anywhere in the create output.

---

### BUG-003: `create --model-provider` help text lists invalid provider names (P2)

**Severity:** Medium — blocks first-time users
**Repro:**
```bash
agentcore create --name test --model-provider openai --model-id gpt-4o --api-key-arn arn:...
# Error: Invalid model provider: openai. Use bedrock, open_ai, or gemini

agentcore create --name test --model-provider anthropic --model-id claude-3-5-sonnet
# Error: Invalid model provider: anthropic. Use bedrock, open_ai, or gemini
```
**Expected:** `create --help` and `add harness --help` should show consistent, correct provider names
**Actual:**
- `create --help` says: `--model-provider <provider>  Model provider (Bedrock, Anthropic, OpenAI, Gemini)`
- `add harness --help` says: `--model-provider <provider>  Model provider: bedrock, open_ai, gemini`
- `Anthropic` is listed in create help but not a valid harness provider at all
- `OpenAI` is listed in create help but the actual accepted value is `open_ai` (with underscore)

**Fix:** Update `create --help` to: `Model provider: bedrock, open_ai, gemini (for harness path)` or accept both `openai` and `open_ai` via normalization.

---

### BUG-004: `create` with Dockerfile path resolves relative to project dir, not CWD (P2)

**Severity:** Medium
**Repro:**
```bash
# From /tmp/harness-bug-bash:
agentcore create --name containertest --model-provider bedrock --model-id x --container ./Dockerfile
# Error: Dockerfile not found at: /tmp/harness-bug-bash/containertest/Dockerfile
```
**Expected:** `./Dockerfile` resolves relative to CWD (`/tmp/harness-bug-bash/Dockerfile`)
**Actual:** Resolves relative to the newly created project directory. Confusing because the project didn't exist before the command ran.

---

### BUG-005: Failed `create` leaves partial project directory (P2)

**Severity:** Medium — leaves confusing broken state
**Repro:**
```bash
agentcore create --name containertest --model-provider bedrock --container ./Dockerfile --skip-install --skip-git
# Fails because Dockerfile not found
ls containertest/
# Shows: agentcore/ AGENTS.md README.md (but no app/ harness directory)
```
**Expected:** On failure, the partially created project directory should be cleaned up
**Actual:** Directory left behind with `agentcore/`, `AGENTS.md`, `README.md` but no harness app. This is a broken, non-functional project state.

---

### BUG-006: `create --session-storage-mount-path` not passed through to harness config (P2)

**Severity:** Medium — silently drops configuration
**Repro:**
```bash
agentcore create --name sessionmount --model-provider bedrock --session-storage-mount-path /mnt/data --skip-git --skip-install
cat sessionmount/app/sessionmount/harness.json
# No sessionStoragePath field present
```
**Expected:** `harness.json` should contain `"sessionStoragePath": "/mnt/data"`
**Actual:** The flag is accepted silently but the value is never written to the harness config.
**Workaround:** Use `agentcore add harness --session-storage /mnt/data` which works correctly.

---

### BUG-007: `remove harness` leaves orphaned memory (P2)

**Severity:** Medium — configuration drift
**Repro:**
```bash
agentcore add harness --name myharness --model-provider bedrock --json
# Creates myharness + myharnessMemory
agentcore remove harness --name myharness -y --json
# Removes harness but myharnessMemory stays in agentcore.json memories[]
```
**Expected:** Removing a harness should also remove (or offer to remove) its auto-created memory
**Actual:** Memory is orphaned in the config. On next deploy, the orphaned memory still gets deployed.

---

### BUG-008: CDK trust policy missing beta/preprod service principal (P2)

**Severity:** Medium — deploy always fails on first try for beta stage
**Repro:**
```bash
export AGENTCORE_STAGE=beta
agentcore deploy -y
# Step "Deploy harnesses" fails: Role validation failed
```
**Expected:** When `AGENTCORE_STAGE=beta`, the CDK-generated IAM role trust policy should include `preprod.genesis-service.aws.internal` as a principal
**Actual:** Trust policy only includes `bedrock-agentcore.amazonaws.com`. Must manually run:
```bash
aws iam update-assume-role-policy --role-name <role> --policy-document '{"Statement":[{"Principal":{"Service":["bedrock-agentcore.amazonaws.com","preprod.genesis-service.aws.internal"]},...}]}'
```
Then re-deploy.

---

### BUG-009: No validation on `--session-storage` path (P3)

**Severity:** Low — bad config accepted, will fail at deploy/runtime
**Repro:**
```bash
agentcore add harness --name test --model-provider bedrock --session-storage "not-a-path" --json
# Success — no validation error

agentcore add harness --name test2 --model-provider bedrock --session-storage /tmp/data --json
# Success — not under /mnt, but still accepted
```
**Expected:** Validate that the path is an absolute path starting with `/mnt/` as documented in the help text
**Actual:** Any string is accepted.

---

## UX Quirks

### QUIRK-001: `create` with no flags defaults to harness path

Running `agentcore create --name foo --skip-install --skip-git` (no `--model-provider`, no `--framework`) creates a harness project, not the traditional agent project. This could confuse existing users who expect the interactive TUI or an agent project by default.

**Suggestion:** Either require explicit `--model-provider` to trigger harness path, or show a clear message: "Creating a harness project (pass --framework to create an agent project instead)."

---

### QUIRK-002: Deprecated model IDs accepted at create time, fail at invoke time

```bash
agentcore create --name x --model-provider bedrock --model-id anthropic.claude-3-5-sonnet-20240620-v1:0
# Success!
agentcore invoke --harness x "hello"
# Error: This model version has reached the end of its life
```

The deprecated model is only caught at runtime. Would be better to warn (or reject) during create/add.

---

### QUIRK-003: `--stream` output looks identical to non-stream

Both `agentcore invoke --harness x "hi"` and `agentcore invoke --harness x --stream "hi"` show a spinner, then the full text. There's no visible difference from the user's perspective. Stream should show tokens incrementally.

---

### QUIRK-004: `traces list` shows `unknown` trace ID for one entry

First trace in the list had `Trace ID: unknown` and no session ID. Likely a health check or cold start trace, but it's confusing to users.

---

### QUIRK-005: `--api-key-arn` should use AgentCore Identity (not Secrets Manager)

The `--api-key-arn` flag name implies Secrets Manager ARNs, but per project requirements it should be using AgentCore Identity for credential management. This needs clarification or rework.

---

## Missing Features

### FEAT-001: `fetch access` does not support `--harness` type

`agentcore fetch access` only supports `--type gateway` and `--type agent`. There is `fetch-harness-token.ts` in the codebase but it's not wired to the CLI command. Users need a way to get the harness endpoint URL and auth info.

---

### FEAT-002: `dev` command has no `--harness` support

`agentcore dev` only works with `--runtime` (agents). There's no local development mode for harnesses. Even `--no-browser` only starts a terminal TUI for agents.

**Impact:** No local development/testing workflow for harness projects.

---

### FEAT-003: `status` has no `--harness <name>` filter

`agentcore status` has `--runtime <name>` to filter by runtime name, but no equivalent `--harness <name>`. The only filter is `--type harness` which shows all harnesses.

---

### FEAT-004: Long-term memory not working with harness

Memory is configured, deployed (status READY), and strategies are set (SEMANTIC, USER_PREFERENCE, SUMMARIZATION, EPISODIC), but:
- The model reports it has no memory tools
- Cross-session recall doesn't work (new session can't remember facts from prior session)
- No memory-related events in verbose streaming output

This may be a backend issue rather than a CLI issue, but the CLI should verify memory is actually functional or document the current limitations.

---

## Documentation Gaps

### DOC-001: No harness documentation in `docs/`

There is no dedicated harness documentation file (e.g., `docs/harness.md`). The existing docs cover agents, gateways, memory, policies, evals, etc. but harness is only mentioned in `docs/tui-harness.md` (TUI testing harness) and internal plan docs.

**Needed:** `docs/harness.md` covering:
- What is a harness and when to use it vs. agents
- Creating a harness project (CLI + TUI)
- Configuring model providers (bedrock, open_ai, gemini)
- Adding tools (all 4 types with examples)
- Session storage
- Custom JWT auth
- Deploying and invoking
- System prompt customization
- Invoke overrides (--model-id, --system-prompt, --max-iterations, etc.)

---

### DOC-002: `create` help text doesn't explain harness vs agent paths

The `create --help` mixes agent flags and harness flags without explaining:
- Which flags trigger which path
- That `--model-provider` triggers the harness path
- That `--framework` triggers the agent path
- That they can't be mixed

A section in the help output or a `agentcore help create` long-form doc would help.

---

### DOC-003: No docs on `aws-targets.json` for harness projects

Agent projects presumably auto-populate this or guide the user through it. Harness projects leave it empty. There's no documentation on the expected format:
```json
[{ "name": "default", "account": "123456789012", "region": "us-west-2" }]
```

---

### DOC-004: Invoke override flags undocumented beyond help text

The `invoke --help` shows many harness-specific override flags (`--model-id`, `--tools`, `--max-iterations`, `--max-tokens`, `--harness-timeout`, `--skills`, `--system-prompt`, `--allowed-tools`, `--actor-id`) but there's no documentation explaining:
- What each override does in practice
- Which overrides persist vs. are per-invocation
- Interaction between overrides (e.g., `--tools` vs `--allowed-tools`)

---

## Test Matrix

| Command | Test | Result |
|---------|-------|--------|
| `create --model-provider bedrock` | Basic harness create | PASS |
| `create --model-provider open_ai --api-key-arn` | OpenAI harness | PASS |
| `create --model-provider gemini --api-key-arn` | Gemini harness | PASS |
| `create --model-provider openai` | Casing normalization | FAIL (BUG-003) |
| `create --model-provider anthropic` | Anthropic provider | FAIL (BUG-003) |
| `create` (no model-provider) | Default path | PASS (quirk: defaults to harness) |
| `create --model-provider bedrock --framework Strands` | Mixed flags | PASS (rejected with clear error) |
| `create --no-harness-memory` | Skip memory | PASS |
| `create --max-iterations --max-tokens --timeout --truncation-strategy` | All optional flags | PASS |
| `create --container <ecr-uri>` | Container URI | PASS |
| `create --container ./Dockerfile` | Dockerfile path | FAIL (BUG-004, BUG-005) |
| `create --session-storage-mount-path` | Session storage via create | FAIL (BUG-006) |
| `create --dry-run` | Not tested | — |
| `add harness --name --model-provider bedrock` | Add to existing project | PASS |
| `add harness` (duplicate name) | Duplicate rejection | PASS |
| `add harness` (invalid name) | Name validation | PASS |
| `add harness --network-mode VPC` (no subnets) | VPC validation | PASS |
| `add harness --session-storage /mnt/data` | Session storage via add | PASS |
| `add harness --session-storage not-a-path` | Invalid path | FAIL (BUG-009) |
| `add harness --authorizer-type CUSTOM_JWT` | JWT auth | PASS |
| `add harness --with-invoke-script` | Invoke script generation | PASS |
| `add tool --type remote_mcp --url` | MCP tool | PASS |
| `add tool --type agentcore_browser` | Browser tool | PASS |
| `add tool --type agentcore_code_interpreter` | Code interpreter | PASS |
| `add tool --type agentcore_gateway --gateway-arn` | Gateway tool | PASS |
| `add tool` (duplicate name) | Duplicate rejection | PASS |
| `add tool --harness nonexistent` | Missing harness | PASS |
| `add tool --type remote_mcp` (no url) | Missing URL validation | PASS |
| `add tool --type invalid_type` | Invalid type error | PASS (but mentions `inline_function` — see note) |
| `remove tool --harness x --name y` | Remove tool | PASS |
| `remove tool` (nonexistent) | Missing tool | PASS |
| `remove harness --name x -y` | Remove harness | PASS (but BUG-007) |
| `remove harness` (nonexistent) | Missing harness | PASS |
| `validate` (valid config) | Validation | PASS |
| `validate` (missing model) | Error detection | PASS |
| `validate` (invalid provider) | Provider validation | PASS |
| `validate` (orphaned memory ref) | Cross-reference check | PASS |
| `deploy -y` | Deploy harness | PASS (after BUG-002 + BUG-008 workarounds) |
| `deploy -y` (empty aws-targets) | First deploy | FAIL (BUG-002) |
| `status` | Show harness | FAIL (BUG-001, duplicate) |
| `status --type harness --json` | Filter + JSON | FAIL (BUG-001, duplicate) |
| `invoke --harness x "prompt"` | Basic invoke | PASS (with valid model) |
| `invoke --harness x --model-id y "prompt"` | Model override | PASS |
| `invoke --harness x --verbose "prompt"` | Verbose streaming | PASS |
| `invoke --harness x --json "prompt"` | JSON output | PASS |
| `invoke --harness x --stream "prompt"` | Streaming | PASS (QUIRK-003) |
| `invoke --harness x --session-id y "prompt"` | Session continuity | PASS |
| `invoke --harness x --system-prompt y "prompt"` | System prompt override | PASS |
| `invoke` (deprecated model) | Model validation | FAIL (QUIRK-002) |
| Cross-session memory recall | Long-term memory | FAIL (FEAT-004) |
| `logs --harness x --limit 5` | Harness logs | PASS |
| `logs --harness x --json` | JSON logs | PASS |
| `traces list --harness x` | List traces | PASS |
| `traces get --harness x <traceId>` | Download trace | PASS |
| `fetch access --type harness` | Fetch harness token | FAIL (FEAT-001) |
| `dev --harness` | Local dev for harness | N/A (FEAT-002) |

---

## Notes

- **`inline_function` tool type:** The error message for invalid tool types lists `inline_function` as valid, but `add tool --help` only shows 4 types and commit `06deb79` removed inline_function tool approval. Inconsistency between validation and help text.
- **`--json` consistency:** All harness commands consistently support `--json` output. Good.
- **Error messages:** Generally clear and actionable across all commands. Good DX.
- **Validation:** Harness config validation (via `agentcore validate`) is thorough — catches missing fields, invalid providers, orphaned memory references.
