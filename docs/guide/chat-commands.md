# Chat Commands

Users can type `/traces` directly in Telegram (or any OpenClaw channel):

```
/traces              → today's summary
/traces recent       → recent 15 steps
/traces workindex    → work index analysis
/traces sql SELECT ...  → SQL query (requires DuckDB)
```

## Examples

### Summary
```
/traces
```
Returns a compact summary of today's agent activity.

### Recent activity
```
/traces recent
```
Shows the last 15 tool calls and LLM invocations.

### SQL query
```
/traces sql SELECT tool_name, COUNT(*) as cnt FROM spans WHERE kind='tool_call' GROUP BY tool_name ORDER BY cnt DESC LIMIT 5
```
Runs a SQL query against the trace data and returns results.

## How it works

The `/traces` command is registered via `api.registerCommand()` in the tracing plugin. It reads today's JSONL trace file and renders the output using the same plain-text formatters as the CLI.

For SQL queries, it uses DuckDB (if installed) and auto-imports JSONL files on first use.
