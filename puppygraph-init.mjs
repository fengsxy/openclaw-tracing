// Build DuckDB database with graph tables for PuppyGraph
import { DuckDBInstance } from '@duckdb/node-api';
import fs from 'node:fs';

const dbPath = '/home/ubuntu/puppygraph/traces.db';
const traceDir = '/home/ubuntu/.openclaw/traces';

const db = await DuckDBInstance.create(dbPath);
const conn = await db.connect();

// Create base spans table
await conn.run(`
  CREATE TABLE IF NOT EXISTS spans (
    trace_id VARCHAR, span_id VARCHAR, parent_span_id VARCHAR,
    kind VARCHAR, name VARCHAR, agent_id VARCHAR, session_key VARCHAR,
    start_ms BIGINT, end_ms BIGINT, duration_ms BIGINT,
    tool_name VARCHAR, tool_params JSON, child_session_key VARCHAR,
    child_agent_id VARCHAR, provider VARCHAR, model VARCHAR,
    tokens_in BIGINT, tokens_out BIGINT, attributes JSON
  )
`);

// Import all JSONL files
const files = fs.readdirSync(traceDir).filter(f => f.endsWith('.jsonl'));
for (const f of files) {
  try {
    await conn.run(`
      INSERT INTO spans SELECT
        traceId, spanId, parentSpanId, kind, name,
        agentId, sessionKey, startMs, endMs, durationMs,
        toolName, toolParams, childSessionKey, childAgentId,
        provider, model, tokensIn, tokensOut, attributes
      FROM read_json('${traceDir}/${f}', format='newline_delimited', columns={
        traceId:'VARCHAR', spanId:'VARCHAR', parentSpanId:'VARCHAR',
        kind:'VARCHAR', name:'VARCHAR', agentId:'VARCHAR',
        sessionKey:'VARCHAR', startMs:'BIGINT', endMs:'BIGINT',
        durationMs:'BIGINT', toolName:'VARCHAR', toolParams:'JSON',
        childSessionKey:'VARCHAR', childAgentId:'VARCHAR',
        provider:'VARCHAR', model:'VARCHAR',
        tokensIn:'BIGINT', tokensOut:'BIGINT', attributes:'JSON'
      })
    `);
    console.log('✓', f);
  } catch(e) { console.log('✗', f, e.message.slice(0,80)); }
}

// Run graph setup SQL
const sql = fs.readFileSync('/tmp/puppygraph-setup.sql', 'utf8');
for (const stmt of sql.split(';').filter(s => s.trim())) {
  try {
    await conn.run(stmt);
  } catch(e) { console.log('SQL error:', e.message.slice(0,100)); }
}

// Verify
const tables = ['graph.sessions', 'graph.tools', 'graph.models',
                'graph.session_uses_tool', 'graph.session_uses_model', 'graph.session_spawns_session'];
console.log('\nGraph tables:');
for (const t of tables) {
  try {
    const r = await conn.runAndReadAll(`SELECT COUNT(*) FROM ${t}`);
    console.log(`  ${t}: ${r.getRows()[0][0]} rows`);
  } catch(e) { console.log(`  ${t}: ERROR`); }
}

conn.dispose();
console.log('\nDuckDB saved to', dbPath);
