# SQL Query Cookbook

Ready-to-use queries for `openclaw traces:query`. All require DuckDB.

## Basics

### Total spans by kind
```sql
SELECT kind, COUNT(*) as cnt FROM spans GROUP BY kind ORDER BY cnt DESC
```

### Spans per day
```sql
SELECT CAST(epoch_ms(start_ms) AS DATE) as day, COUNT(*) as spans
FROM spans GROUP BY day ORDER BY day
```

## Tool analysis

### Most used tools
```sql
SELECT tool_name, COUNT(*) as cnt, ROUND(AVG(duration_ms)) as avg_ms
FROM spans WHERE kind='tool_call' AND tool_name IS NOT NULL
GROUP BY tool_name ORDER BY cnt DESC LIMIT 10
```

### Slowest tool calls
```sql
SELECT tool_name, duration_ms, session_key,
       CAST(epoch_ms(start_ms) AS TIMESTAMP) as time
FROM spans WHERE kind='tool_call' ORDER BY duration_ms DESC LIMIT 10
```

### Tool usage by session
```sql
SELECT session_key, tool_name, COUNT(*) as cnt
FROM spans WHERE kind='tool_call' AND tool_name IS NOT NULL
GROUP BY session_key, tool_name ORDER BY session_key, cnt DESC
```

## LLM analysis

### Token consumption by model
```sql
SELECT model,
       COUNT(*) as calls,
       ROUND(SUM(tokens_in)/1000000.0, 1) as mtok_in,
       ROUND(SUM(tokens_out)/1000000.0, 1) as mtok_out
FROM spans WHERE kind='llm_call' GROUP BY model ORDER BY mtok_in DESC
```

### Daily token trend
```sql
SELECT CAST(epoch_ms(start_ms) AS DATE) as day,
       SUM(tokens_in) as tok_in, SUM(tokens_out) as tok_out
FROM spans WHERE kind='llm_call' GROUP BY day ORDER BY day
```

### Slowest LLM calls
```sql
SELECT model, duration_ms, tokens_in, tokens_out
FROM spans WHERE kind='llm_call' ORDER BY duration_ms DESC LIMIT 10
```

## Session analysis

### Per-session breakdown
```sql
SELECT session_key,
       COUNT(*) FILTER (WHERE kind='llm_call') as llm,
       COUNT(*) FILTER (WHERE kind='tool_call') as tools,
       COALESCE(SUM(tokens_in), 0) as tok_in,
       MAX(end_ms) - MIN(start_ms) as duration_ms
FROM spans GROUP BY session_key ORDER BY tok_in DESC
```

### Subagent vs main comparison
```sql
SELECT
  CASE WHEN session_key LIKE '%subagent%' THEN 'subagent' ELSE 'main' END as type,
  COUNT(DISTINCT session_key) as sessions,
  COUNT(*) FILTER (WHERE kind='tool_call') as total_tools,
  COALESCE(SUM(tokens_in), 0) as total_tokens
FROM spans GROUP BY 1
```

## Work Index via SQL

### Tool density per day
```sql
SELECT CAST(epoch_ms(start_ms) AS DATE) as day,
       COUNT(*) FILTER (WHERE kind='llm_call') as llm,
       COUNT(*) FILTER (WHERE kind='tool_call') as tools,
       ROUND(COUNT(*) FILTER (WHERE kind='tool_call')::FLOAT /
             NULLIF(COUNT(*) FILTER (WHERE kind='llm_call'), 0), 1) as density
FROM spans GROUP BY day ORDER BY day
```

## Error analysis

### Failed spans
```sql
SELECT kind, tool_name, name,
       json_extract_string(attributes, '$.error') as error
FROM spans
WHERE json_extract_string(attributes, '$.error') IS NOT NULL
```
