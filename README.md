# openclaw-tracing

Agent execution tracing plugin for [OpenClaw](https://github.com/openclaw/openclaw). Gives you tree-view visibility into tool calls, LLM invocations, and sub-agent relationships with zero external dependencies.

## Install

```bash
openclaw plugins install /path/to/openclaw-tracing
```

Or clone and install:

```bash
git clone https://github.com/fengsxy/openclaw-tracing.git
openclaw plugins install ./openclaw-tracing
```

## Enable

```bash
openclaw config set tracing.enabled true
```

Restart the gateway after enabling.

## Usage

### CLI

```bash
# List available trace dates
openclaw traces --list

# View all traces for today (call tree + entity tree + waterfall)
openclaw traces

# View specific mode
openclaw traces --mode call
openclaw traces --mode entity
openclaw traces --mode waterfall

# View traces for a specific date
openclaw traces --date 2026-03-09
```

### Web UI

Open `http://<your-gateway>/plugins/tracing` in a browser for an interactive viewer with three tabs: Call Tree, Entity Tree, and Waterfall.

## What it traces

| Hook | Span kind | Data captured |
|------|-----------|---------------|
| `session_start/end` | session | Agent ID, duration, message count |
| `llm_input/output` | llm_call | Provider, model, token usage |
| `before/after_tool_call` | tool_call | Tool name, params, duration |
| `subagent_spawning/ended` | subagent | Child agent ID, outcome |

Sub-agent sessions inherit the parent's trace ID, so the entire call chain appears as one connected tree.

## Storage

Traces are stored as JSONL files in `~/.openclaw/traces/YYYY-MM-DD.jsonl`, auto-rotated daily.

## Development

```bash
npm install
npm test
```

## License

MIT
