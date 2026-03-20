# PuppyGraph Integration

[PuppyGraph](https://www.puppygraph.com/) turns your trace data into a queryable graph — zero ETL, directly on DuckDB. Visualize agent-tool-model relationships with Cypher or Gremlin queries.

![PuppyGraph Schema](/screenshots/puppygraph-home.png)

## Graph model

```
Session (agent/subagent)  --uses_tool-->   Tool (Read, Exec, Grep...)
Session                   --uses_model-->  Model (claude-opus-4-6...)
Session                   --spawns-->      Session (parent → child)
```

## Setup

### 1. Start PuppyGraph

Requires Docker, ~4G RAM recommended.

```bash
docker run -p 8081:8081 -p 8182:8182 -p 7687:7687 \
  -v puppygraph-data:/home/share \
  -e PUPPYGRAPH_PASSWORD=puppygraph123 \
  -d --name puppygraph --rm --pull=always \
  puppygraph/puppygraph:stable
```

### 2. Prepare graph data

Export traces to a DuckDB file with vertex and edge tables. See the full SQL in [`puppygraph/puppygraph-setup.sql`](https://github.com/fengsxy/openclaw-tracing/blob/main/puppygraph/puppygraph-setup.sql).

Key tables created:
- **Vertices:** `sessions`, `tools`, `models`
- **Edges:** `session_uses_tool`, `session_uses_model`, `session_spawns_session`

### 3. Upload schema

```bash
curl -XPOST -H 'content-type: application/json' \
  -d @puppygraph/schema.json \
  --user 'puppygraph:puppygraph123' \
  http://localhost:8081/schema
```

## Cypher queries

### Full graph visualization
```cypher
MATCH (n)-[e]->(m) RETURN n, e, m LIMIT 100
```

### Agent → Tool usage
```cypher
MATCH (s:session)-[u:uses_tool]->(t:tool)
RETURN s, u, t ORDER BY u.call_count DESC LIMIT 10
```

### Subagent spawn chain
```cypher
MATCH (parent:session)-[:spawns]->(child:session)
RETURN parent, child
```

### 2-hop: main → subagent → tools
```cypher
MATCH (main:session)-[:spawns]->(sub:session)-[u:uses_tool]->(t:tool)
RETURN main.session_key, sub.session_key, t.name, u.call_count
```

### Tools shared across agents
```cypher
MATCH (s:session)-[:uses_tool]->(t:tool)
RETURN t.name, count(s) AS used_by ORDER BY used_by DESC
```

### Anomaly detection: spinning agents
```cypher
MATCH (s:session) WHERE s.total_tokens_in > 1000000 AND s.tool_call_count < 5
RETURN s.session_key, s.total_tokens_in, s.tool_call_count
```

### Impact analysis: what depends on a tool?
```cypher
MATCH (s:session)-[:uses_tool]->(t:tool {name: 'exec'})
RETURN s.session_key, s.agent_type
```

### Cost attribution per subagent
```cypher
MATCH (main:session)-[:spawns]->(sub:session)-[:uses_model]->(m:model)
RETURN sub.session_key, m.name, sub.total_tokens_in
ORDER BY sub.total_tokens_in DESC
```

## Web UI

Open `http://localhost:8081`, login with `puppygraph` / `puppygraph123`. Use the Query tab to run Cypher queries and visualize the graph.
