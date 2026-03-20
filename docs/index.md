---
layout: home
hero:
  name: OpenClaw Tracing
  text: See what your agent is really doing
  tagline: Full-stack observability for OpenClaw agents — from Call Tree to Graph Analytics
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/fengsxy/openclaw-tracing
features:
  - icon: 🌳
    title: Call Tree
    details: Nested span hierarchy with auto-collapsing consecutive tool calls. New spans highlight on refresh.
  - icon: 🕸️
    title: Entity Graph
    details: Force-directed SVG showing agents, subagents, models, and per-entity tool nodes.
  - icon: 📈
    title: Work Index
    details: Agent productivity scoring — tool density, token efficiency, idle detection. Know if your agent is working or spinning.
  - icon: 🔍
    title: SQL Analytics
    details: Query traces with DuckDB SQL. Export to Parquet. Sync to Iceberg or PuppyGraph for graph analytics.
  - icon: 💬
    title: Chat & CLI
    details: "/traces in Telegram, traces:summary in CLI, or traces:query for SQL — access your data anywhere."
  - icon: 🦆
    title: Zero Infrastructure
    details: JSONL by default, DuckDB optional, Iceberg & PuppyGraph for scale. Start simple, grow as needed.
---

## Screenshots

### Call Tree
Nested execution hierarchy with collapsible tool groups and new-span highlighting.

![Call Tree](/screenshots/call-tree.png)

### Entity Graph
Force-directed visualization of agent-tool-model relationships.

![Entity Graph](/screenshots/entity-graph.png)

### Work Index
Agent productivity scoring with time-series chart and phase breakdown.

![Work Index](/screenshots/work-index.png)

