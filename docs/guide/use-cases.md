# Use Cases

Real examples from production OpenClaw agent traces, queried with PuppyGraph (Cypher) and DuckDB (SQL).

## Overview

Our test dataset: **6 days, 2,596 spans, 14 sessions, 14 tools, 3 models**.

```
Graph: 31 vertices, 70 edges
├── 14 sessions (agents/subagents/cron)
├── 14 tools (exec, read, write, web_fetch...)
├── 3 models (claude-opus-4-6, claude-sonnet-4-6, stepfun)
├── 45 uses_tool edges
├── 19 uses_model edges
└── 6 spawns edges
```

---

## 1. Agent Tool Usage Profile

**Question:** What tools does each agent use most?

**Cypher:**
```cypher
MATCH (s:session)-[u:uses_tool]->(t:tool)
RETURN s.agent_type, t.name, u.call_count
ORDER BY u.call_count DESC LIMIT 10
```

**Result:**
```
[main] → exec: 696 calls
[main] → web_fetch: 118 calls
[main] → write: 90 calls
[main] → read: 80 calls
[subagent] → read: 40 calls
[subagent] → read: 30 calls
```

**Insight:** Main agent heavily relies on `exec` (shell commands). Subagents focus on `read` — they're doing research while the main agent executes.

---

## 2. Subagent Delegation Chain

**Question:** What did the main agent delegate to subagents?

**Cypher:**
```cypher
MATCH (p:session)-[:spawns]->(c:session)
RETURN p.session_key, c.session_key, c.tool_call_count, c.total_tokens_in
```

**Result:**
```
main → subagent:b9dae003  (tools=30, tokens=160,229)
main → subagent:0bdcc4a5  (tools=4, tokens=88,995)
main → subagent:06b0e0af  (tools=60, tokens=0)
main → subagent:1d8e216b  (tools=42, tokens=0)
main → subagent:d7639251  (tools=36, tokens=0)
main → cron:d7cbde0c      (tools=32, tokens=114,785)
```

**Insight:** 6 child entities spawned. Some subagents (06b0e0af) did 60 tool calls with 0 token tracking — these may have been spawned before the tracing plugin loaded, so `llm_input` hooks weren't captured.

---

## 3. Model Cost Attribution

**Question:** Which models consume the most tokens, and who's using them?

**Cypher:**
```cypher
MATCH (s:session)-[u:uses_model]->(m:model)
RETURN s.agent_type, m.name, sum(u.call_count) AS calls, sum(u.total_tokens_in) AS tokens
ORDER BY tokens DESC
```

**Result:**
```
main → claude-opus-4-6:         754 calls, 48,780,770 tokens
main → claude-sonnet-4-6:        21 calls,  3,065,408 tokens
main → stepfun/step-3.5-flash:   42 calls,  2,967,660 tokens
subagent → claude-opus-4-6:       7 calls,    249,224 tokens
```

**Insight:** Opus dominates at 48.8M tokens. Sonnet is used 21 times (likely for cheaper tasks). StepFun's free tier handles 42 calls — good for cost optimization. Subagents use minimal tokens compared to main.

---

## 4. Tool Sharing Analysis

**Question:** Which tools are used across the most sessions?

**Cypher:**
```cypher
MATCH (s:session)-[:uses_tool]->(t:tool)
RETURN t.name, count(s) AS used_by, t.avg_duration_ms
ORDER BY used_by DESC
```

**Result:**
```
exec:           12 sessions, avg 990ms
read:           11 sessions, avg 30ms
web_fetch:       5 sessions, avg 529ms
write:           5 sessions, avg 33ms
memory_search:   2 sessions, avg 68ms
browser:         1 session,  avg 1175ms
```

**Insight:** `exec` and `read` are universal — every session uses them. `browser` is the slowest tool (1.2s avg) but rarely used. `read` is fast (30ms) and heavily shared.

---

## 5. Subagent Tool Chains (2-hop Query)

**Question:** What tools do subagents use after being spawned?

**Cypher:**
```cypher
MATCH (main:session)-[:spawns]->(sub:session)-[u:uses_tool]->(t:tool)
RETURN sub.session_key, t.name, u.call_count
ORDER BY u.call_count DESC LIMIT 10
```

**Result:**
```
subagent:06b0e0af → read:  40 calls
subagent:1d8e216b → read:  30 calls
subagent:d7639251 → read:  28 calls
subagent:b9dae003 → exec:  20 calls
subagent:06b0e0af → exec:  20 calls
cron:d7cbde0c     → exec:  18 calls
cron:d7cbde0c     → read:  12 calls
```

**Insight:** Subagents are primarily readers (read-heavy), while the cron job does a mix of reading and executing. This pattern suggests subagents are used for research/exploration tasks.

---

## 6. Tool Co-occurrence

**Question:** Which tools tend to be used together?

**Cypher:**
```cypher
MATCH (s:session)-[:uses_tool]->(t1:tool), (s)-[:uses_tool]->(t2:tool)
WHERE t1.name < t2.name
RETURN t1.name, t2.name, count(s) AS co_occurrence
ORDER BY co_occurrence DESC LIMIT 8
```

**Result:**
```
exec + read:        10 sessions
exec + write:        5 sessions
read + write:        5 sessions
read + web_fetch:    5 sessions
exec + web_fetch:    4 sessions
web_fetch + write:   3 sessions
memory_search + web_fetch:  2 sessions
memory_search + read:       2 sessions
```

**Insight:** `exec + read` is the most common combo (10/14 sessions). `web_fetch` often pairs with `read` and `write` — fetching data then processing it. `memory_search` only appears with web_fetch and read, suggesting it's used in research flows.

---

## 7. Spinning Detection

**Question:** Are any agents burning tokens without doing work?

**SQL (DuckDB):**
```sql
SELECT session_key,
       COUNT(*) FILTER (WHERE kind='llm_call') as llm,
       COUNT(*) FILTER (WHERE kind='tool_call') as tools,
       COALESCE(SUM(tokens_in), 0) as tokens,
       ROUND(COUNT(*) FILTER (WHERE kind='tool_call')::FLOAT /
             NULLIF(COUNT(*) FILTER (WHERE kind='llm_call'), 0), 1) as density
FROM spans
GROUP BY session_key
ORDER BY tokens DESC
```

**Result:**
```
session_key                              | llm | tools | tokens    | density
agent:main:main                          | 99  | 171   | 9,013,761 | 1.7
agent:main:subagent:b9dae003             |  2  |  30   |   160,229 | 15.0
agent:main:cron:4945510b                 |  2  |   2   |    35,342 | 1.0
```

**Insight:** Main agent has density 1.7 (Planning/Working boundary). Subagent b9dae003 has exceptional density of 15.0 — doing 30 tools with only 2 LLM calls, very efficient. The cron job is borderline at 1.0.

---

## 8. Daily Token Trend

**SQL (DuckDB):**
```sql
SELECT CAST(epoch_ms(start_ms) AS DATE) as day,
       COUNT(*) FILTER (WHERE kind='llm_call') as llm,
       COUNT(*) FILTER (WHERE kind='tool_call') as tools,
       COALESCE(SUM(tokens_in), 0) as tokens
FROM spans GROUP BY day ORDER BY day
```

**Result:**
```
day        | llm | tools | tokens
2026-03-12 | 106 | 341   | 9,209,332
2026-03-13 | 166 | 259   | 8,191,351
2026-03-14 | 128 | 182   | 5,208,367
2026-03-15 | 162 | 426   | 19,235,430
2026-03-16 | 170 | 395   | 10,484,519
2026-03-17 |  88 | 132   | 2,674,099
```

**Insight:** March 15 was the busiest day (19.2M tokens, 426 tool calls). March 17 was light. Token consumption doesn't always correlate with tool calls — March 13 had fewer tools but still 8.2M tokens.

---

## Summary

| Use Case | Best Tool | What You Learn |
|----------|-----------|----------------|
| Tool usage profile | PuppyGraph | Which tools each agent relies on |
| Delegation chain | PuppyGraph | Parent→child spawn relationships |
| Cost attribution | PuppyGraph | Token spend per model per agent |
| Tool sharing | PuppyGraph | Universal vs. specialized tools |
| 2-hop tool chains | PuppyGraph | What subagents actually do |
| Co-occurrence | PuppyGraph | Tool usage patterns |
| Spinning detection | DuckDB SQL | Identify inefficient agents |
| Daily trends | DuckDB SQL | Usage patterns over time |
