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
      },
      { commands: ["traces", "traces:summary", "traces:recent", "traces:workindex"] },
    );
  },
};

export default plugin;
