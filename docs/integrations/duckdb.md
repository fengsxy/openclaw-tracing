# DuckDB Integration

DuckDB adds embedded SQL analytics to your traces — no external database needed.

## Setup

```bash
cd ~/.openclaw/extensions/openclaw-tracing
npm install @duckdb/node-api
openclaw gateway restart
```

## How it works

- First time you run `traces:query`, all JSONL files are auto-imported into `~/.openclaw/traces/traces.duckdb`
- Subsequent queries run directly against DuckDB (fast, no re-import)
- The `spans` table contains all trace data

## Schema

```sql
CREATE TABLE spans (
  trace_id VARCHAR,
  span_id VARCHAR,
  parent_span_id VARCHAR,
  kind VARCHAR,          -- 'session', 'llm_call', 'tool_call', 'subagent'
  name VARCHAR,
  agent_id VARCHAR,
  session_key VARCHAR,
  start_ms BIGINT,
  end_ms BIGINT,
  duration_ms BIGINT,
  tool_name VARCHAR,
  tool_params JSON,
  child_session_key VARCHAR,
  child_agent_id VARCHAR,
  provider VARCHAR,
  model VARCHAR,
  tokens_in BIGINT,
  tokens_out BIGINT,
  attributes JSON
)
```

## Useful queries

### Daily token consumption
```sql
SELECT CAST(epoch_ms(start_ms) AS DATE) as day, SUM(tokens_in) as tok_in
FROM spans WHERE kind='llm_call' GROUP BY day ORDER BY day;
```

### Slowest tool calls
```sql
SELECT tool_name, duration_ms, session_key
FROM spans WHERE kind='tool_call' ORDER BY duration_ms DESC LIMIT 10;
```

### Per-subagent breakdown
```sql
SELECT session_key,
       COUNT(*) FILTER (WHERE kind='tool_call') as tools,
       COUNT(*) FILTER (WHERE kind='llm_call') as llm_calls
FROM spans GROUP BY session_key;
```

### Model cost comparison
```sql
SELECT model, COUNT(*) as calls,
       ROUND(SUM(tokens_in)/1000000.0, 1) as mtok_in,
       ROUND(SUM(tokens_out)/1000000.0, 1) as mtok_out
FROM spans WHERE kind='llm_call' GROUP BY model ORDER BY mtok_in DESC;
```

### Find spinning phases
```sql
SELECT CAST(epoch_ms(start_ms) AS DATE) as day,
       COUNT(*) FILTER (WHERE kind='llm_call') as llm,
       COUNT(*) FILTER (WHERE kind='tool_call') as tools,
       ROUND(COUNT(*) FILTER (WHERE kind='tool_call')::FLOAT /
             NULLIF(COUNT(*) FILTER (WHERE kind='llm_call'), 0), 1) as density
FROM spans GROUP BY day ORDER BY day;
```

## Parquet export

```bash
openclaw traces:export
openclaw traces:export --date 2026-03-12 --output /tmp/traces.parquet
```

Parquet files can be loaded into any data tool: Spark, Pandas, Polars, BigQuery, etc.
