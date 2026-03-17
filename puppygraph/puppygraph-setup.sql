-- PuppyGraph needs separate tables for vertices and edges
-- We map our tracing data to a graph model:
--
-- Vertices: session, llm_call, tool_call
-- Edges: session --calls--> tool_call, session --invokes--> llm_call, session --spawns--> session

CREATE SCHEMA IF NOT EXISTS graph;

-- === VERTEX TABLES ===

-- Sessions (agents/subagents)
CREATE TABLE graph.sessions AS
SELECT DISTINCT
  session_key AS id,
  agent_id,
  session_key,
  CASE WHEN session_key LIKE '%subagent%' THEN 'subagent' ELSE 'main' END AS agent_type,
  MIN(start_ms) AS first_seen_ms,
  MAX(end_ms) AS last_seen_ms,
  COUNT(*) FILTER (WHERE kind = 'llm_call') AS llm_call_count,
  COUNT(*) FILTER (WHERE kind = 'tool_call') AS tool_call_count,
  COALESCE(SUM(tokens_in), 0) AS total_tokens_in,
  COALESCE(SUM(tokens_out), 0) AS total_tokens_out
FROM spans
WHERE session_key IS NOT NULL
GROUP BY session_key, agent_id;

-- Tools used
CREATE TABLE graph.tools AS
SELECT DISTINCT
  tool_name AS id,
  tool_name AS name,
  COUNT(*) AS call_count,
  ROUND(AVG(duration_ms)) AS avg_duration_ms
FROM spans
WHERE kind = 'tool_call' AND tool_name IS NOT NULL
GROUP BY tool_name;

-- Models used
CREATE TABLE graph.models AS
SELECT DISTINCT
  model AS id,
  model AS name,
  provider,
  COUNT(*) AS call_count,
  COALESCE(SUM(tokens_in), 0) AS total_tokens_in,
  COALESCE(SUM(tokens_out), 0) AS total_tokens_out
FROM spans
WHERE kind = 'llm_call' AND model IS NOT NULL
GROUP BY model, provider;

-- === EDGE TABLES ===

-- Session uses Tool (aggregated)
CREATE TABLE graph.session_uses_tool AS
SELECT
  session_key || '::' || tool_name AS id,
  session_key AS from_id,
  tool_name AS to_id,
  COUNT(*) AS call_count,
  COALESCE(ROUND(AVG(duration_ms)), 0) AS avg_duration_ms,
  COALESCE(SUM(duration_ms), 0) AS total_duration_ms
FROM spans
WHERE kind = 'tool_call' AND tool_name IS NOT NULL AND session_key IS NOT NULL
GROUP BY session_key, tool_name;

-- Session invokes Model (aggregated)
CREATE TABLE graph.session_uses_model AS
SELECT
  session_key || '::' || model AS id,
  session_key AS from_id,
  model AS to_id,
  COUNT(*) AS call_count,
  COALESCE(SUM(tokens_in), 0) AS total_tokens_in,
  COALESCE(SUM(tokens_out), 0) AS total_tokens_out
FROM spans
WHERE kind = 'llm_call' AND model IS NOT NULL AND session_key IS NOT NULL
GROUP BY session_key, model;

-- Session spawns Session (parent -> child)
CREATE TABLE graph.session_spawns_session AS
SELECT
  from_session || '::spawns::' || to_session AS id,
  from_session AS from_id,
  to_session AS to_id
FROM (
  SELECT DISTINCT
    s1.session_key AS from_session,
    s2.session_key AS to_session
  FROM spans s1
  JOIN spans s2 ON s2.parent_span_id = s1.span_id
  WHERE s1.kind = 'session' AND s2.kind = 'session'
    AND s1.session_key IS NOT NULL AND s2.session_key IS NOT NULL
    AND s1.session_key != s2.session_key
);
