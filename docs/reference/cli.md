# CLI Reference

## `openclaw traces`

View traces in the terminal with colored output.

| Option | Description | Default |
|--------|-------------|---------|
| `--mode <mode>` | View mode: `call`, `entity`, `waterfall`, `both` | `both` |
| `--date <date>` | Date to view (YYYY-MM-DD) | today |
| `--list` | List available trace dates | - |

## `openclaw traces:summary`

Compact plain-text summary. Designed for LLM consumption.

| Option | Description | Default |
|--------|-------------|---------|
| `--date <date>` | Date (YYYY-MM-DD) | today |

## `openclaw traces:recent`

Recent steps as a compact timeline.

| Option | Description | Default |
|--------|-------------|---------|
| `--date <date>` | Date (YYYY-MM-DD) | today |
| `--steps <n>` | Number of recent steps | 20 |

## `openclaw traces:workindex`

Work Index per time window.

| Option | Description | Default |
|--------|-------------|---------|
| `--date <date>` | Date (YYYY-MM-DD) | today |

## `openclaw traces:query`

Run SQL query against trace data using DuckDB.

| Option | Description | Default |
|--------|-------------|---------|
| `<sql>` | SQL query (required argument) | - |
| `--format <fmt>` | Output format: `table`, `csv`, `json` | `table` |

Requires `@duckdb/node-api` to be installed.

## `openclaw traces:export`

Export traces to Parquet format.

| Option | Description | Default |
|--------|-------------|---------|
| `--date <date>` | Export specific date only | all dates |
| `--output <path>` | Output file path | `~/.openclaw/traces/traces.parquet` |

Requires `@duckdb/node-api` to be installed.
