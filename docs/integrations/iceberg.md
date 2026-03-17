# Apache Iceberg Integration

For production-scale analytics, team-wide querying, or integration with data platforms, traces can be synced to Apache Iceberg tables on AWS.

## Architecture

```
JSONL → DuckDB → Parquet → S3 → Glue Catalog (Iceberg) → Athena / Spark / Trino
```

## Prerequisites

- AWS account with S3 + Glue + Athena permissions
- DuckDB installed in the plugin

## Step 1: Create AWS resources

```bash
# Create S3 bucket
aws s3 mb s3://your-traces-bucket --region us-east-1

# Create Glue database
aws glue create-database \
  --database-input '{"Name":"openclaw_traces"}' \
  --region us-east-1

# Create Iceberg table
aws glue create-table --database-name openclaw_traces --region us-east-1 \
  --open-table-format-input '{"IcebergInput":{"MetadataOperation":"CREATE","Version":"2"}}' \
  --table-input '{
    "Name": "spans",
    "StorageDescriptor": {
      "Columns": [
        {"Name": "trace_id", "Type": "string"},
        {"Name": "span_id", "Type": "string"},
        {"Name": "kind", "Type": "string"},
        {"Name": "name", "Type": "string"},
        {"Name": "session_key", "Type": "string"},
        {"Name": "start_ms", "Type": "bigint"},
        {"Name": "end_ms", "Type": "bigint"},
        {"Name": "duration_ms", "Type": "bigint"},
        {"Name": "tool_name", "Type": "string"},
        {"Name": "model", "Type": "string"},
        {"Name": "tokens_in", "Type": "bigint"},
        {"Name": "tokens_out", "Type": "bigint"},
        {"Name": "trace_date", "Type": "string"}
      ],
      "Location": "s3://your-traces-bucket/iceberg/spans/",
      "InputFormat": "org.apache.hadoop.mapred.FileInputFormat",
      "OutputFormat": "org.apache.hadoop.mapred.FileOutputFormat",
      "SerdeInfo": {"SerializationLibrary": "org.apache.hadoop.hive.serde2.lazy.LazySimpleSerDe"}
    },
    "TableType": "EXTERNAL_TABLE"
  }'
```

## Step 2: Sync traces to Iceberg

DuckDB connects to Glue's Iceberg REST API:

```bash
openclaw traces:query "
  INSTALL iceberg; LOAD iceberg;
  INSTALL aws; LOAD aws;

  CREATE SECRET (TYPE S3, KEY_ID 'YOUR_KEY', SECRET 'YOUR_SECRET', REGION 'us-east-1');

  ATTACH 'YOUR_ACCOUNT_ID' AS lake (
    TYPE ICEBERG,
    ENDPOINT 'glue.us-east-1.amazonaws.com/iceberg',
    AUTHORIZATION_TYPE sigv4
  );

  INSERT INTO lake.openclaw_traces.spans
  SELECT trace_id, span_id, kind, name, session_key,
         start_ms, end_ms, duration_ms, tool_name, model,
         tokens_in, tokens_out,
         CAST(epoch_ms(start_ms) AS DATE)::VARCHAR as trace_date
  FROM spans;
"
```

## Step 3: Query with Athena

```sql
SELECT model, SUM(tokens_in) as total_tokens
FROM openclaw_traces.spans
WHERE trace_date >= '2026-03-10'
GROUP BY model;
```

## Alternative: Parquet on S3

If you don't need full Iceberg features (ACID, time travel), export partitioned Parquet directly:

```bash
openclaw traces:query "
  INSTALL httpfs; LOAD httpfs;
  CREATE SECRET (TYPE S3, KEY_ID 'YOUR_KEY', SECRET 'YOUR_SECRET', REGION 'us-east-1');
  COPY spans TO 's3://your-bucket/traces/data.parquet' (FORMAT PARQUET);
"
```

## Cost estimate

| Component | Monthly cost |
|-----------|-------------|
| S3 storage | < $0.01 |
| Glue Catalog | Free (first 1M requests) |
| Athena queries | < $0.10 |
| **Total** | **< $0.15/month** |
