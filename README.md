# openclaw-tracing

Agent execution tracing plugin for [OpenClaw](https://github.com/openclaw/openclaw). Gives you full visibility into tool calls, LLM invocations, and sub-agent relationships.

## Install

```bash
openclaw plugins install openclaw-tracing
openclaw gateway restart
```

### Optional: Enable SQL queries & Parquet export (DuckDB)

```bash
cd ~/.openclaw/extensions/openclaw-tracing
npm install @duckdb/node-api
openclaw gateway restart
```

DuckDB is optional — the plugin works fine without it using JSONL storage. DuckDB adds SQL query support and Parquet export.

## Features

### Web UI

Open `http://<your-gateway>/plugins/tracing` in a browser. Four views:

| View | Description |
|------|-------------|
| **Call Tree** | Nested span hierarchy. Consecutive same-tool calls auto-collapse (e.g. `Read ×7`). New spans highlight green on refresh. |
| **Entity Graph** | Force-directed SVG showing agents, subagents, models, and per-entity tool nodes. |
| **Waterfall** | Timeline bar chart of all spans. |
| **Work Index** | Agent productivity scoring — tool density, token efficiency, idle detection. |

Auto-refreshes every 3 seconds with a live indicator.

### CLI commands

```bash
# Classic views (colored, for humans)
openclaw traces                        # call tree + entity + waterfall
openclaw traces --mode call            # call tree only
openclaw traces --list                 # list available dates
openclaw traces --date 2026-03-12      # specific date

# LLM-friendly (plain text, compact)
openclaw traces:summary                # one-shot summary
openclaw traces:recent                 # last 20 steps timeline
openclaw traces:recent --steps 50      # last 50 steps
openclaw traces:workindex              # work index per time window

# SQL queries (requires DuckDB)
openclaw traces:query "SELECT tool_name, COUNT(*) as cnt FROM spans WHERE kind='tool_call' GROUP BY tool_name ORDER BY cnt DESC LIMIT 10"
openclaw traces:query "SELECT model, SUM(tokens_in) FROM spans WHERE kind='llm_call' GROUP BY model" --format json
openclaw traces:query "..." --format csv

# Parquet export (requires DuckDB)
openclaw traces:export                          # export all
openclaw traces:export --date 2026-03-12        # export one day
openclaw traces:export --output /tmp/my.parquet  # custom path
```

### Chat command

Users can type `/traces` directly in Telegram (or any channel):

```
/traces              → today's summary
/traces recent       → recent activity
/traces workindex    → work index
/traces sql SELECT ...  → SQL query (requires DuckDB)
```

### Example outputs

**`traces:summary`**
```
=== Trace Summary ===
Duration: 45.2s
Entities: 4 (1 main, 3 subagents)
LLM calls: 8 | Tokens: 12,450 in, 3,200 out
Tool calls: 23
Top tools: Read(7) Grep(5) Edit(4) Bash(3)
Models: claude-opus-4-6
Work Index: 72/100 (Working) | Density: 2.9 tools/llm | Efficiency: 1.5 tools/1k-tok
```

**`traces:query` (table format)**
```
tool_name | cnt  | avg_ms
----------+------+-------
exec      | 1004 | 990
read      | 303  | 30
web_fetch | 148  | 529
write     | 122  | 33
edit      | 45   | 22
```

## What it traces

| Hook | Span kind | Data captured |
|------|-----------|---------------|
| `session_start/end` | session | Agent ID, session key, duration |
| `llm_input/output` | llm_call | Provider, model, token usage |
| `before/after_tool_call` | tool_call | Tool name, params, duration |
| `subagent_spawning/ended` | subagent | Child agent ID, outcome |

Sub-agent sessions inherit the parent's trace ID via `sessions_spawn` detection, so the entire call chain appears as one connected tree.

## Storage

### JSONL (default)

Traces are stored as JSONL files in `~/.openclaw/traces/YYYY-MM-DD.jsonl`, auto-rotated daily. No dependencies required.

### DuckDB (optional)

DuckDB adds embedded SQL analytics — no external database needed, just one npm package.

**Setup:**

```bash
cd ~/.openclaw/extensions/openclaw-tracing
npm install @duckdb/node-api
openclaw gateway restart
```

**How it works:**

- First time you run `traces:query`, all JSONL files are auto-imported into `~/.openclaw/traces/traces.duckdb`
- Subsequent queries run directly against DuckDB (fast, no re-import)
- Data schema: `spans` table with columns `trace_id`, `span_id`, `kind`, `tool_name`, `model`, `tokens_in`, `tokens_out`, `duration_ms`, `session_key`, etc.

**CLI commands:**

```bash
# Run any SQL query
openclaw traces:query "SELECT tool_name, COUNT(*) as cnt FROM spans WHERE kind='tool_call' GROUP BY tool_name ORDER BY cnt DESC LIMIT 10"

# Output as JSON (for programmatic use)
openclaw traces:query "SELECT model, SUM(tokens_in) as total FROM spans WHERE kind='llm_call' GROUP BY model" --format json

# Output as CSV
openclaw traces:query "..." --format csv

# Export to Parquet file
openclaw traces:export
openclaw traces:export --date 2026-03-12 --output /tmp/traces.parquet
```

**Useful queries:**

```sql
-- Daily token consumption
SELECT CAST(epoch_ms(start_ms) AS DATE) as day, SUM(tokens_in) as tok_in
FROM spans WHERE kind='llm_call' GROUP BY day ORDER BY day;

-- Slowest tool calls
SELECT tool_name, duration_ms, session_key
FROM spans WHERE kind='tool_call' ORDER BY duration_ms DESC LIMIT 10;

-- Per-subagent breakdown
SELECT session_key, COUNT(*) FILTER (WHERE kind='tool_call') as tools,
       COUNT(*) FILTER (WHERE kind='llm_call') as llm_calls
FROM spans GROUP BY session_key;

-- Model cost comparison
SELECT model, COUNT(*) as calls,
       ROUND(SUM(tokens_in)/1000000.0, 1) as mtok_in,
       ROUND(SUM(tokens_out)/1000000.0, 1) as mtok_out
FROM spans WHERE kind='llm_call' GROUP BY model ORDER BY mtok_in DESC;

-- Find spinning phases (high tokens, low tool usage)
SELECT CAST(epoch_ms(start_ms) AS DATE) as day,
       COUNT(*) FILTER (WHERE kind='llm_call') as llm,
       COUNT(*) FILTER (WHERE kind='tool_call') as tools,
       ROUND(COUNT(*) FILTER (WHERE kind='tool_call')::FLOAT /
             NULLIF(COUNT(*) FILTER (WHERE kind='llm_call'), 0), 1) as density
FROM spans GROUP BY day ORDER BY day;
```

### Apache Iceberg (optional)

For production-scale analytics, team-wide querying, or integration with data platforms (Athena, Spark, Trino, Snowflake), traces can be synced to Apache Iceberg tables on AWS.

**Architecture:**

```
JSONL → DuckDB → Parquet → S3 → Glue Catalog (Iceberg) → Athena / Spark / Trino
```

**Prerequisites:**

- AWS account with S3 + Glue + Athena permissions
- DuckDB installed in the plugin (see above)

**Step 1: Create AWS resources**

```bash
# Create S3 bucket for trace data
aws s3 mb s3://your-traces-bucket --region us-east-1

# Create Glue database
aws glue create-database \
  --database-input '{"Name":"openclaw_traces"}' \
  --region us-east-1

# Create Iceberg table in Glue
aws glue create-table --database-name openclaw_traces --region us-east-1 \
  --open-table-format-input '{"IcebergInput":{"MetadataOperation":"CREATE","Version":"2"}}' \
  --table-input '{
    "Name": "spans",
    "StorageDescriptor": {
      "Columns": [
        {"Name": "trace_id", "Type": "string"},
        {"Name": "span_id", "Type": "string"},
        {"Name": "parent_span_id", "Type": "string"},
        {"Name": "kind", "Type": "string"},
        {"Name": "name", "Type": "string"},
        {"Name": "agent_id", "Type": "string"},
        {"Name": "session_key", "Type": "string"},
        {"Name": "start_ms", "Type": "bigint"},
        {"Name": "end_ms", "Type": "bigint"},
        {"Name": "duration_ms", "Type": "bigint"},
        {"Name": "tool_name", "Type": "string"},
        {"Name": "tool_params", "Type": "string"},
        {"Name": "provider", "Type": "string"},
        {"Name": "model", "Type": "string"},
        {"Name": "tokens_in", "Type": "bigint"},
        {"Name": "tokens_out", "Type": "bigint"},
        {"Name": "trace_date", "Type": "string"}
      ],
      "Location": "s3://your-traces-bucket/iceberg/spans/",
      "InputFormat": "org.apache.hadoop.mapred.FileInputFormat",
      "OutputFormat": "org.apache.hadoop.mapred.FileOutputFormat",
      "SerdeInfo": {"SerializationLibrary": "org.apache.hadoop.hive.serde2.lazy.LazySimpleSerDe"}
    },
    "TableType": "EXTERNAL_TABLE"
  }'
```

**Step 2: Sync traces to Iceberg**

DuckDB connects to Glue's Iceberg REST API directly:

```bash
openclaw traces:query "
  INSTALL iceberg; LOAD iceberg;
  INSTALL aws; LOAD aws;

  -- Configure AWS credentials
  CREATE SECRET (TYPE S3, KEY_ID 'YOUR_KEY', SECRET 'YOUR_SECRET', REGION 'us-east-1');

  -- Attach Glue Iceberg catalog (use your AWS account ID as warehouse)
  ATTACH 'YOUR_ACCOUNT_ID' AS lake (
    TYPE ICEBERG,
    ENDPOINT 'glue.us-east-1.amazonaws.com/iceberg',
    AUTHORIZATION_TYPE sigv4
  );

  -- Insert traces into Iceberg
  INSERT INTO lake.openclaw_traces.spans
  SELECT trace_id, span_id, parent_span_id, kind, name, agent_id, session_key,
         start_ms, end_ms, duration_ms, tool_name, tool_params,
         provider, model, tokens_in, tokens_out,
         CAST(epoch_ms(start_ms) AS DATE)::VARCHAR as trace_date
  FROM spans;
"
```

**Step 3: Query with Athena**

Once data is in Iceberg, query it from AWS Console → Athena:

```sql
-- Total tokens by model this week
SELECT model, SUM(tokens_in) as total_tokens
FROM openclaw_traces.spans
WHERE trace_date >= '2026-03-10'
GROUP BY model;

-- Iceberg time travel: compare today vs yesterday
SELECT * FROM openclaw_traces.spans FOR VERSION AS OF 1;
```

**Alternative: Parquet on S3 (simpler)**

If you don't need full Iceberg features (ACID, time travel), you can export partitioned Parquet directly:

```bash
openclaw traces:query "
  INSTALL httpfs; LOAD httpfs;
  CREATE SECRET (TYPE S3, KEY_ID 'YOUR_KEY', SECRET 'YOUR_SECRET', REGION 'us-east-1');
  COPY spans TO 's3://your-bucket/traces/data.parquet' (FORMAT PARQUET);
"
```

Then register as a Hive table in Glue for Athena access — simpler setup, works for most use cases.

**Cost estimate (AWS):**

| Component | Monthly cost (typical) |
|-----------|----------------------|
| S3 storage | < $0.01 (traces are small) |
| Glue Catalog | Free (first 1M requests) |
| Athena queries | < $0.10 (Parquet is compressed) |
| **Total** | **< $0.15/month** |

### PuppyGraph (optional)

[PuppyGraph](https://www.puppygraph.com/) turns your trace data into a queryable graph — zero ETL, directly on DuckDB. Visualize agent-tool-model relationships and run Cypher/Gremlin graph queries.

**Graph model:**

```
Session (agent/subagent)  --uses_tool-->   Tool (Read, Exec, Grep...)
Session                   --uses_model-->  Model (claude-opus-4-6...)
Session                   --spawns-->      Session (parent → child)
```

**Setup:**

```bash
# 1. Start PuppyGraph (needs Docker, ~4G RAM recommended)
docker run -p 8081:8081 -p 8182:8182 -p 7687:7687 \
  -v puppygraph-data:/home/share \
  -e PUPPYGRAPH_PASSWORD=puppygraph123 \
  -d --name puppygraph --rm --pull=always \
  puppygraph/puppygraph:stable

# 2. Prepare graph data in DuckDB
# Export your traces to a DuckDB file with graph tables:
duckdb /path/to/share/graph.db << 'SQL'
  -- Import trace spans
  CREATE TABLE spans AS SELECT * FROM read_json('~/.openclaw/traces/*.jsonl',
    format='newline_delimited', union_by_name=true, columns={
      traceId:'VARCHAR', spanId:'VARCHAR', parentSpanId:'VARCHAR',
      kind:'VARCHAR', name:'VARCHAR', agentId:'VARCHAR',
      sessionKey:'VARCHAR', startMs:'BIGINT', endMs:'BIGINT',
      durationMs:'BIGINT', toolName:'VARCHAR', toolParams:'VARCHAR',
      provider:'VARCHAR', model:'VARCHAR',
      tokensIn:'BIGINT', tokensOut:'BIGINT'
    });

  -- Vertex: sessions (agents/subagents)
  CREATE TABLE sessions AS SELECT DISTINCT session_key AS id, agent_id, session_key,
    CASE WHEN session_key LIKE '%subagent%' THEN 'subagent' ELSE 'main' END AS agent_type,
    CAST(COUNT(*) FILTER (WHERE kind='llm_call') AS BIGINT) AS llm_call_count,
    CAST(COUNT(*) FILTER (WHERE kind='tool_call') AS BIGINT) AS tool_call_count,
    CAST(COALESCE(SUM(tokens_in),0) AS BIGINT) AS total_tokens_in,
    CAST(COALESCE(SUM(tokens_out),0) AS BIGINT) AS total_tokens_out
  FROM spans WHERE session_key IS NOT NULL GROUP BY session_key, agent_id;

  -- Vertex: tools
  CREATE TABLE tools AS SELECT tool_name AS id, tool_name AS name,
    CAST(COUNT(*) AS BIGINT) AS call_count,
    CAST(COALESCE(ROUND(AVG(duration_ms)),0) AS BIGINT) AS avg_duration_ms
  FROM spans WHERE kind='tool_call' AND tool_name IS NOT NULL GROUP BY tool_name;

  -- Vertex: models
  CREATE TABLE models AS SELECT model AS id, model AS name, MAX(provider) AS provider,
    CAST(COUNT(*) AS BIGINT) AS call_count,
    CAST(COALESCE(SUM(tokens_in),0) AS BIGINT) AS total_tokens_in,
    CAST(COALESCE(SUM(tokens_out),0) AS BIGINT) AS total_tokens_out
  FROM spans WHERE kind='llm_call' AND model IS NOT NULL GROUP BY model;

  -- Edge: session → tool
  CREATE TABLE session_uses_tool AS SELECT session_key||'::'||tool_name AS id,
    session_key AS from_id, tool_name AS to_id,
    CAST(COUNT(*) AS BIGINT) AS call_count,
    CAST(COALESCE(SUM(duration_ms),0) AS BIGINT) AS total_duration_ms
  FROM spans WHERE kind='tool_call' AND tool_name IS NOT NULL AND session_key IS NOT NULL
  GROUP BY session_key, tool_name;

  -- Edge: session → model
  CREATE TABLE session_uses_model AS SELECT session_key||'::'||model AS id,
    session_key AS from_id, model AS to_id,
    CAST(COUNT(*) AS BIGINT) AS call_count,
    CAST(COALESCE(SUM(tokens_in),0) AS BIGINT) AS total_tokens_in
  FROM spans WHERE kind='llm_call' AND model IS NOT NULL AND session_key IS NOT NULL
  GROUP BY session_key, model;

  -- Edge: session spawns session
  CREATE TABLE session_spawns_session AS SELECT from_sk||'::spawns::'||to_sk AS id,
    from_sk AS from_id, to_sk AS to_id
  FROM (SELECT DISTINCT s1.session_key AS from_sk, s2.session_key AS to_sk
    FROM spans s1 JOIN spans s2 ON s2.parent_span_id = s1.span_id
    WHERE s1.kind='session' AND s2.kind='session'
    AND s1.session_key != s2.session_key);
SQL

# 3. Upload schema to PuppyGraph
curl -XPOST -H 'content-type: application/json' \
  -d @schema.json \
  --user 'puppygraph:puppygraph123' \
  http://localhost:8081/schema
```

The `schema.json` file is included in the [`puppygraph/`](./puppygraph/) directory of this repo.

**Cypher queries:**

```cypher
-- Full graph visualization
MATCH (n)-[e]->(m) RETURN n, e, m LIMIT 100

-- Agent → Tool usage (top 10)
MATCH (s:session)-[u:uses_tool]->(t:tool)
RETURN s, u, t ORDER BY u.call_count DESC LIMIT 10

-- Subagent spawn chain
MATCH (parent:session)-[:spawns]->(child:session)
RETURN parent, child

-- 2-hop: main agent → subagent → tools
MATCH (main:session)-[:spawns]->(sub:session)-[u:uses_tool]->(t:tool)
RETURN main.session_key, sub.session_key, t.name, u.call_count

-- Which tools are shared across most agents?
MATCH (s:session)-[:uses_tool]->(t:tool)
RETURN t.name, count(s) AS used_by ORDER BY used_by DESC

-- Agent → Model usage
MATCH (s:session)-[u:uses_model]->(m:model)
RETURN s, u, m
```

**Web UI:** Open `http://localhost:8081`, login with `puppygraph` / `puppygraph123`.

## Work Index

The Work Index (0-100) measures agent productivity per time window:

| Score | Status | Meaning |
|-------|--------|---------|
| 61-100 | **Working** | High tool call rate, efficient token usage |
| 26-60 | **Planning** | Moderate activity, reading/exploring |
| 1-25 | **Spinning** | High token usage but few tool calls |
| 0 | **Idle** | No activity |

Formula components:
- **Tool density** = tools per LLM call (weight: 50%)
- **Token efficiency** = tools per 1k tokens (weight: 30%)
- **Delegation bonus** = subagent spawns (weight: 20%)

## Development

```bash
git clone https://github.com/fengsxy/openclaw-tracing.git
cd openclaw-tracing
npm install
npm test
```

## License

MIT
