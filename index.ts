import os from "node:os";
import path from "node:path";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { TraceCollector } from "./src/collector.js";
import { JsonlTraceWriter } from "./src/storage-jsonl.js";
import { renderCallTree, renderEntityTree, renderWaterfall, renderSummary, renderRecent, renderWorkIndex } from "./src/viewer-cli.js";
import { createTracingHttpHandler } from "./src/web-viewer.js";

const plugin = {
  id: "tracing",
  name: "Agent Tracing",
  description: "Trace tool calls, LLM invocations, and sub-agent relationships",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    const traceDir = path.join(os.homedir(), ".openclaw", "traces");
    const writer = new JsonlTraceWriter(traceDir);
    const collector = new TraceCollector((span) => {
      api.logger.info(`[tracing] emit span: kind=${span.kind} name=${span.name}`);
      writer.write(span);
    });

    api.logger.info("[tracing] registering hooks...");

    api.on("session_start", (event, ctx) => {
      api.logger.info(`[tracing] session_start fired: sessionId=${event.sessionId}`);
      collector.onSessionStart(event, ctx);
    });
    api.on("session_end", (event, ctx) => {
      api.logger.info(`[tracing] session_end fired: sessionId=${event.sessionId}`);
      collector.onSessionEnd(event, ctx);
    });
    api.on("llm_input", (event, ctx) => {
      api.logger.info(`[tracing] llm_input fired: model=${event.model}`);
      collector.onLlmInput(event, ctx);
    });
    api.on("llm_output", (event, ctx) => {
      api.logger.info(`[tracing] llm_output fired: model=${event.model}`);
      collector.onLlmOutput(event, ctx);
    });
    api.on("before_tool_call", (event, ctx) => {
      api.logger.info(`[tracing] before_tool_call fired: tool=${event.toolName}`);
      collector.onBeforeToolCall(event, ctx);
    });
    api.on("after_tool_call", (event, ctx) => {
      api.logger.info(`[tracing] after_tool_call fired: tool=${event.toolName}`);
      collector.onAfterToolCall(event, ctx);
    });
    api.on("subagent_spawning", (event, ctx) => {
      api.logger.info(`[tracing] subagent_spawning fired: agent=${event.agentId}`);
      collector.onSubagentSpawning(event, ctx);
    });
    api.on("subagent_ended", (event, ctx) => {
      api.logger.info(`[tracing] subagent_ended fired`);
      collector.onSubagentEnded(event, ctx);
    });

    api.logger.info("[tracing] hooks registered OK");

    // Web UI at /plugins/tracing
    api.registerHttpRoute({
      path: "/plugins/tracing",
      auth: "plugin",
      match: "prefix",
      handler: createTracingHttpHandler(writer),
    });

    api.registerCli(
      ({ program }) => {
        program
          .command("traces")
          .description("View agent execution traces")
          .option("--mode <mode>", "View mode: call, entity, waterfall, both", "both")
          .option("--date <date>", "Date to view (YYYY-MM-DD), defaults to today")
          .option("--list", "List available trace dates")
          .action((opts: { mode?: string; date?: string; list?: boolean }) => {
            if (opts.list) {
              const dates = writer.listDates();
              if (!dates.length) {
                console.log("No traces found.");
                return;
              }
              for (const d of dates) console.log(d);
              return;
            }

            const dateKey = opts.date ?? new Date().toISOString().slice(0, 10);
            const spans = writer.readByDate(dateKey);
            if (!spans.length) {
              console.log(`No traces for ${dateKey}.`);
              return;
            }

            const mode = opts.mode ?? "both";
            if (mode === "call" || mode === "both") {
              for (const line of renderCallTree(spans)) console.log(line);
            }
            if (mode === "entity" || mode === "both") {
              for (const line of renderEntityTree(spans)) console.log(line);
            }
            if (mode === "waterfall" || mode === "both") {
              for (const line of renderWaterfall(spans)) console.log(line);
            }
          });

        // LLM-friendly subcommands
        program
          .command("traces:summary")
          .description("Compact plain-text summary of traces (LLM-friendly)")
          .option("--date <date>", "Date (YYYY-MM-DD), defaults to today")
          .action((opts: { date?: string }) => {
            const dateKey = opts.date ?? new Date().toISOString().slice(0, 10);
            const spans = writer.readByDate(dateKey);
            for (const line of renderSummary(spans)) console.log(line);
          });

        program
          .command("traces:recent")
          .description("Recent N steps as compact timeline (LLM-friendly)")
          .option("--date <date>", "Date (YYYY-MM-DD), defaults to today")
          .option("--steps <n>", "Number of recent steps to show", "20")
          .action((opts: { date?: string; steps?: string }) => {
            const dateKey = opts.date ?? new Date().toISOString().slice(0, 10);
            const spans = writer.readByDate(dateKey);
            for (const line of renderRecent(spans, parseInt(opts.steps || "20", 10))) console.log(line);
          });

        program
          .command("traces:workindex")
          .description("Work index per time window (LLM-friendly)")
          .option("--date <date>", "Date (YYYY-MM-DD), defaults to today")
          .action((opts: { date?: string }) => {
            const dateKey = opts.date ?? new Date().toISOString().slice(0, 10);
            const spans = writer.readByDate(dateKey);
            for (const line of renderWorkIndex(spans)) console.log(line);
          });

        program
          .command("traces:query")
          .description("Run SQL query against trace data using DuckDB")
          .argument("<sql>", "SQL query to execute")
          .option("--format <fmt>", "Output format: table, csv, json", "table")
          .action(async (sql: string, opts: { format?: string }) => {
            try {
              const { DuckDBInstance } = await import("@duckdb/node-api");
              const dbPath = path.join(traceDir, "traces.duckdb");

              // Check if duckdb file exists, if not import JSONL first
              const fs = await import("node:fs");
              const needsImport = !fs.existsSync(dbPath);

              const db = await DuckDBInstance.create(dbPath);
              const conn = await db.connect();

              // Create table if needed
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

              // Auto-import JSONL if db is fresh
              if (needsImport) {
                const files = fs.readdirSync(traceDir).filter((f: string) => f.endsWith(".jsonl"));
                for (const f of files) {
                  const filePath = path.join(traceDir, f);
                  try {
                    await conn.run(`
                      INSERT INTO spans SELECT
                        traceId, spanId, parentSpanId, kind, name,
                        agentId, sessionKey, startMs, endMs, durationMs,
                        toolName, toolParams, childSessionKey, childAgentId,
                        provider, model, tokensIn, tokensOut, attributes
                      FROM read_json('${filePath}', format='newline_delimited', columns={
                        traceId:'VARCHAR', spanId:'VARCHAR', parentSpanId:'VARCHAR',
                        kind:'VARCHAR', name:'VARCHAR', agentId:'VARCHAR',
                        sessionKey:'VARCHAR', startMs:'BIGINT', endMs:'BIGINT',
                        durationMs:'BIGINT', toolName:'VARCHAR', toolParams:'JSON',
                        childSessionKey:'VARCHAR', childAgentId:'VARCHAR',
                        provider:'VARCHAR', model:'VARCHAR',
                        tokensIn:'BIGINT', tokensOut:'BIGINT', attributes:'JSON'
                      })
                    `);
                  } catch {
                    // skip malformed files
                  }
                }
                console.log(`Imported ${files.length} trace files into DuckDB.`);
              }

              // Execute query
              const result = await conn.runAndReadAll(sql);
              const cols = result.columnNames() as string[];
              const rows = result.getRows() as unknown[][];

              if (!rows.length) {
                console.log("(no results)");
                return;
              }

              const fmt = opts.format || "table";

              // Convert BigInt to Number for serialization
              const normalize = (v: unknown) => typeof v === "bigint" ? Number(v) : v;

              if (fmt === "json") {
                const jsonRows = rows.map(row => {
                  const obj: Record<string, unknown> = {};
                  cols.forEach((c, i) => { obj[c] = normalize(row[i]); });
                  return obj;
                });
                console.log(JSON.stringify(jsonRows, null, 2));
              } else if (fmt === "csv") {
                console.log(cols.join(","));
                for (const row of rows) {
                  console.log(row.map(v => v == null ? "" : String(v)).join(","));
                }
              } else {
                // table format
                const widths = cols.map((c, i) => {
                  const maxVal = Math.max(...rows.map(r => String(r[i] ?? "").length));
                  return Math.max(c.length, Math.min(maxVal, 40));
                });
                const header = cols.map((c, i) => c.padEnd(widths[i])).join(" | ");
                const sep = widths.map(w => "-".repeat(w)).join("-+-");
                console.log(header);
                console.log(sep);
                for (const row of rows) {
                  const line = row.map((v, i) => {
                    const s = String(v ?? "");
                    return (s.length > 40 ? s.slice(0, 37) + "..." : s).padEnd(widths[i]);
                  }).join(" | ");
                  console.log(line);
                }
                console.log(`\n${rows.length} row(s)`);
              }
            } catch (e: any) {
              if (e.code === "ERR_MODULE_NOT_FOUND" || e.message?.includes("duckdb")) {
                console.error("DuckDB not installed. Run: npm install @duckdb/node-api");
              } else {
                console.error("Query error:", e.message);
              }
            }
          });

        program
          .command("traces:export")
          .description("Export traces to Parquet format")
          .option("--date <date>", "Export specific date only")
          .option("--output <path>", "Output file path", path.join(traceDir, "traces.parquet"))
          .action(async (opts: { date?: string; output?: string }) => {
            try {
              const { DuckDBInstance } = await import("@duckdb/node-api");
              const dbPath = path.join(traceDir, "traces.duckdb");
              const fs = await import("node:fs");

              if (!fs.existsSync(dbPath)) {
                console.error("No DuckDB database found. Run traces:query first to import data.");
                return;
              }

              const db = await DuckDBInstance.create(dbPath);
              const conn = await db.connect();

              const outPath = opts.output || path.join(traceDir, "traces.parquet");
              const dateFilter = opts.date
                ? `WHERE CAST(epoch_ms(start_ms) AS DATE) = '${opts.date}'`
                : "";

              await conn.run(`COPY (SELECT * FROM spans ${dateFilter} ORDER BY start_ms) TO '${outPath}' (FORMAT PARQUET)`);
              const size = fs.statSync(outPath).size;
              console.log(`Exported to ${outPath} (${(size / 1024).toFixed(1)} KB)`);
            } catch (e: any) {
              console.error("Export error:", e.message);
            }
          });
      },
      { commands: ["traces", "traces:summary", "traces:recent", "traces:workindex", "traces:query", "traces:export"] },
    );
  },
};

export default plugin;
