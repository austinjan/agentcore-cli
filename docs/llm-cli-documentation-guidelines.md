# LLM CLI Documentation Guidelines

## Purpose

This document defines how to write command help, output hints, and navigation guidance for command-line tools that are expected to be used by LLMs.

Use it for:

- CLI help text
- command output design
- large-output continuation design
- async task navigation
- repo documentation for agent-driven utilities

This document is generic. It is not specific to one command family.

## Core Principle

A command should not only describe what it does.

It should also help the caller answer:

1. why this command would be called
2. what information it returns
3. what the most likely next step is
4. how to go deeper if more detail is needed
5. what identifiers from this output can be reused as inputs to later commands

For LLM usage, command guidance is part of the command contract.

## Standard Topics

Every important command should define these topics either in help text, output text, or both.

### 1. `purpose`

Describe the single main job of the command.

Good:

- `Read deployment status.`
- `Queue an evaluation run.`

Bad:

- mixed background, architecture, and examples in one paragraph

### 2. `intent`

Describe why a user or LLM would call the command.

Examples:

- discovery
- detail lookup
- trigger an operation
- inspect status
- continue from a previous result

This is especially important when different commands look similar but serve different stages of a workflow.

### 3. `inputs`

Describe:

- required arguments
- optional arguments
- mutually exclusive selectors
- default behavior when no selector is provided

Do not force the LLM to infer these from examples alone.

### 4. `output`

Describe:

- whether output is summary text, JSON, task id, output id, or file
- whether data is live, cached, or config-derived
- whether output is full detail or only a summary

If the command is not a fresh probe, say that explicitly.

### 5. `constraints`

Describe known limitations up front.

Examples:

- requires authentication
- reads only from local config
- does not contact AWS
- only works after deploy
- local file paths only work in local mode

This is better than letting the LLM infer unsupported behavior.

### 6. `identifier mapping`

If output contains identifiers that can be used later, define that mapping explicitly.

Examples:

- `use name as <agent-name>`
- `use trace_id with traces get`
- `use run_id with evals history`
- `use output_id with output show`
- `use operation_id with task status`

This topic is critical. LLMs often fail because the output contains usable identifiers but the command never says so.

### 7. `next step candidates`

List the most likely next commands after this command succeeds.

Examples:

```text
next:
  use `name` as `<agent-name>`
  agentcore status --name <agent-name>
  agentcore logs --name <agent-name>
```

Keep the list short and high-signal.

Do not repeat the same next-step hint for every record when one global hint is enough.

### 8. `further information guide`

Tell the caller how to go deeper.

Examples:

- use `show` or `get` for one record
- use `fields` to discover supported field names
- use `output show` or `output slice` for truncated content
- use `task result` or `task events` for async operations

This should answer: “if this is not enough, where do I go next?”

### 9. `hints & samples`

Examples are required.

Include:

- one minimal valid invocation
- one common filtered invocation
- one deeper-inspection or continuation example when relevant

Do not overload help with too many examples.

### 10. `large output guidance`

If output may be large or unknown in size, explain:

- that the command may return an `output_id`
- how to read it
- which continuation commands exist

Example:

```text
next:
  output_id: out_...
  agentcore output show out_...
  agentcore output slice out_... --offset 4000 --limit 2000
```

### 11. `async guidance`

If the command starts asynchronous work, explain:

- that it returns an `operation_id`
- how to inspect it
- whether the command waits or only queues

Example:

```text
next:
  agentcore task status <operation-id>
  agentcore task result <operation-id>
  agentcore task events <operation-id>
```

### 12. `failure recovery`

For common failure cases, define the recovery step.

Examples:

- not authenticated -> login first
- unknown field -> fields
- resource not found -> list
- task not complete -> task status

This should answer: “if it fails, what should I try next?”

## Output Design Rules

### Prefer stable labels

Use stable output labels that are easy for LLMs to reuse.

Examples:

- `resource_count`
- `fields`
- `operation_id`
- `output_id`
- `next`

Avoid casual renaming of labels after they are established.

### Prefer markdown-like blocks over tables

Good:

```text
## resource 1
- name: my-agent
- status: deployed
```

Bad:

- wide aligned tables with implicit columns

### Do not duplicate navigation hints per record unless needed

If the same command can be reused for every item, prefer one global hint:

```text
next:
  use `name` as `<agent-name>`
  agentcore status --name <agent-name>
```

instead of repeating record-specific continuation fields on every row.

### Separate data from navigation

The record body should primarily contain data.

The navigation guidance should usually live in:

- a top-level `next:` block
- a footer
- a dedicated continuation section

### Use intent-specific summaries

Do not copy one command's output shape into another command if the caller intent differs.

Even if both read from the same backend source, their summaries should reflect different user goals.

## Help Text Structure

For most commands, use this order:

1. `Purpose`
2. `Intent`
3. `Inputs`
4. `Output`
5. `Constraints`
6. `Identifier discovery` or `Selector discovery` if relevant
7. `Examples`

Optional additions:

- `Next steps`
- `Further information`
- `Large output behavior`
- `Async behavior`

## Workflow Thinking

When designing LLM-facing docs for a command, ask:

1. Why would the caller run this command first?
2. Is the command for discovery, execution, status, or detail?
3. What is the most likely next question after reading this output?
4. Does the system already have deeper information elsewhere?
5. Which exact value in the output should be reused next?
6. Should the deeper path be one global hint or per-record hint?

If these are not answered in the help text or output contract, the command is not fully documented for LLM use.

## Recommended Command Classes

### Discovery commands

Examples:

- `list`
- `fields`
- `templates`
- `history`

Should emphasize:

- selector discovery
- identifier mapping
- next-step drill-down

### Detail commands

Examples:

- `show`
- `get`
- `describe`

Should emphasize:

- full detail vs summary
- field projection
- where the returned identifiers can be reused

### Async execution commands

Examples:

- `deploy`
- `run eval`
- `package`

Should emphasize:

- operation lifecycle
- task id
- next inspection commands

### Large-output producer commands

Examples:

- large `list`
- exports
- reports

Should emphasize:

- `output_id`
- continuation commands
- whether inline text is only a preview

## Maintenance Rule

When changing an LLM-facing utility:

1. update command help
2. update any output hints that changed
3. update utility-specific guides
4. update this generic guideline only when the cross-utility rule itself changes

Utility-specific guides should reference this file instead of copying the whole rule set when possible.
