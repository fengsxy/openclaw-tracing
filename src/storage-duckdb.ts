import path from "node:path";
import type { TraceSpan } from "./types.js";

/**
 * DuckDB-backed trace storage.
 * Stores spans in a single DuckDB database file with full SQL query support.
 * Can import existing JSONL files and export to Parquet.
 */
export class DuckDbTraceWriter {
  private readonly dbPath: string;
  private db: any = null;
  private conn: any = null;
  private ready: Promise<void>;

  constructor(dir: string) {
    this.dbPath = path.join(dir, "traces.duckdb");
    this.ready = this.init(dir);
  }

  private async init(dir: string): Promise<void> {
    const { DuckDBInstance } = await import("@duckdb/node-api");
    const fs = await import("node:fs");
    fs.mkdirSync(dir, { recursive: true });

    this.db = await DuckDBInstance.create(this.dbPath);
    this.conn = await this.db.connect();

    await this.conn.run(`
      CREATE TABLE IF NOT EXISTS spans (
        trace_id VARCHAR,
        span_id VARCHAR,
        parent_span_id VARCHAR,
        kind VARCHAR,
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
        attributes JSON,
        date_key DATE GENERATED ALWAYS AS (CAST(epoch_ms(start_ms) AS DATE)),
        PRIMARY KEY (span_id, kind)
      )
    `);
  }

  /** Write a span to DuckDB. */
  async write(span: TraceSpan): Promise<void> {
    await this.ready;
    await this.conn.run(
      `INSERT OR REPLACE INTO spans (
        trace_id, span_id, parent_span_id, kind, name,
        agent_id, session_key, start_ms, end_ms, duration_ms,
        tool_name, tool_params, child_session_key, child_agent_id,
        provider, model, tokens_in, tokens_out, attributes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      span.traceId,
      span.spanId,
      span.parentSpanId ?? null,
      span.kind,
      span.name,
      span.agentId ?? null,
      span.sessionKey ?? null,
      span.startMs,
      span.endMs ?? null,
      span.durationMs ?? null,
      span.toolName ?? null,
      span.toolParams ? JSON.stringify(span.toolParams) : null,
      span.childSessionKey ?? null,
      span.childAgentId ?? null,
      span.provider ?? null,
      span.model ?? null,
      span.tokensIn ?? null,
      span.tokensOut ?? null,
      JSON.stringify(span.attributes),
    );
  }

  /** Read spans by date, returning TraceSpan objects. */
  async readByDate(dateKey: string): Promise<TraceSpan[]> {
    await this.ready;
    const result = await this.conn.runAndReadAll(
      `SELECT * FROM spans WHERE date_key = ? ORDER BY start_ms`,
      dateKey,
    );
    return result.getRows().map((row: any) => this.rowToSpan(row, result.columnNames()));
  }

  /** List available trace dates. */
  async listDates(): Promise<string[]> {
    await this.ready;
    const result = await this.conn.runAndReadAll(
      `SELECT DISTINCT date_key FROM spans ORDER BY date_key DESC`,
    );
    return result.getRows().map((row: any) => {
      const val = row[0];
      // DuckDB DATE comes as Date object or string
      if (val instanceof Date) return val.toISOString().slice(0, 10);
      return String(val).slice(0, 10);
    });
  }

  /** Run arbitrary SQL query and return results. */
  async query(sql: string, ...params: unknown[]): Promise<Record<string, unknown>[]> {
    await this.ready;
    const result = await this.conn.runAndReadAll(sql, ...params);
    const cols = result.columnNames();
    return result.getRows().map((row: any) => {
      const obj: Record<string, unknown> = {};
      cols.forEach((col: string, i: number) => {
        obj[col] = row[i];
      });
      return obj;
    });
  }

  /** Import existing JSONL file into DuckDB. */
  async importJsonl(jsonlPath: string): Promise<number> {
    await this.ready;
    const before = await this.conn.runAndReadAll(`SELECT COUNT(*) FROM spans`);
    const beforeCount = Number(before.getRows()[0][0]);

    await this.conn.run(
      `INSERT INTO spans (
        trace_id, span_id, parent_span_id, kind, name,
        agent_id, session_key, start_ms, end_ms, duration_ms,
        tool_name, tool_params, child_session_key, child_agent_id,
        provider, model, tokens_in, tokens_out, attributes
      )
      SELECT
        traceId, spanId, parentSpanId, kind, name,
        agentId, sessionKey, startMs, endMs, durationMs,
        toolName, toolParams, childSessionKey, childAgentId,
        provider, model, tokensIn, tokensOut, attributes
      FROM read_json($1,
        format='newline_delimited',
        columns={
          traceId: 'VARCHAR', spanId: 'VARCHAR', parentSpanId: 'VARCHAR',
          kind: 'VARCHAR', name: 'VARCHAR', agentId: 'VARCHAR',
          sessionKey: 'VARCHAR', startMs: 'BIGINT', endMs: 'BIGINT',
          durationMs: 'BIGINT', toolName: 'VARCHAR', toolParams: 'JSON',
          childSessionKey: 'VARCHAR', childAgentId: 'VARCHAR',
          provider: 'VARCHAR', model: 'VARCHAR',
          tokensIn: 'BIGINT', tokensOut: 'BIGINT', attributes: 'JSON'
        }
      )`,
      jsonlPath,
    );

    const after = await this.conn.runAndReadAll(`SELECT COUNT(*) FROM spans`);
    return Number(after.getRows()[0][0]) - beforeCount;
  }

  /** Export spans to Parquet file. */
  async exportParquet(outputPath: string, dateKey?: string): Promise<void> {
    await this.ready;
    if (dateKey) {
      await this.conn.run(
        `COPY (SELECT * FROM spans WHERE date_key = ? ORDER BY start_ms) TO ? (FORMAT PARQUET)`,
        dateKey,
        outputPath,
      );
    } else {
      await this.conn.run(
        `COPY (SELECT * FROM spans ORDER BY start_ms) TO ? (FORMAT PARQUET)`,
        outputPath,
      );
    }
  }

  /** Remove spans older than retentionDays. */
  async cleanup(retentionDays: number): Promise<void> {
    await this.ready;
    await this.conn.run(
      `DELETE FROM spans WHERE date_key < CURRENT_DATE - INTERVAL ? DAY`,
      retentionDays,
    );
  }

  /** Close the database connection. */
  async close(): Promise<void> {
    if (this.conn) {
      this.conn.dispose();
      this.conn = null;
    }
    if (this.db) {
      this.db.dispose();
      this.db = null;
    }
  }

  private rowToSpan(row: any[], cols: string[]): TraceSpan {
    const get = (name: string) => {
      const idx = cols.indexOf(name);
      return idx >= 0 ? row[idx] : undefined;
    };
    return {
      traceId: get("trace_id") as string,
      spanId: get("span_id") as string,
      parentSpanId: get("parent_span_id") ?? undefined,
      kind: get("kind") as TraceSpan["kind"],
      name: get("name") as string,
      agentId: get("agent_id") ?? undefined,
      sessionKey: get("session_key") ?? undefined,
      startMs: Number(get("start_ms")),
      endMs: get("end_ms") != null ? Number(get("end_ms")) : undefined,
      durationMs: get("duration_ms") != null ? Number(get("duration_ms")) : undefined,
      toolName: get("tool_name") ?? undefined,
      toolParams: get("tool_params") ? JSON.parse(get("tool_params") as string) : undefined,
      childSessionKey: get("child_session_key") ?? undefined,
      childAgentId: get("child_agent_id") ?? undefined,
      provider: get("provider") ?? undefined,
      model: get("model") ?? undefined,
      tokensIn: get("tokens_in") != null ? Number(get("tokens_in")) : undefined,
      tokensOut: get("tokens_out") != null ? Number(get("tokens_out")) : undefined,
      attributes: get("attributes") ? JSON.parse(get("attributes") as string) : {},
    };
  }
}
