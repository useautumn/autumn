-- Materialized view for analytics usage aggregations
-- Pre-aggregates events by org_id, env, customer_id, event_name, and time periods
-- Optimizes timeseries queries that group events by hour/day

CREATE MATERIALIZED VIEW IF NOT EXISTS events_usage_mv
ENGINE = SummingMergeTree(value)
PARTITION BY toYYYYMM(period_hour)
ORDER BY (org_id, env, customer_id, event_name, period_hour)
SETTINGS allow_nullable_key = 1
POPULATE
AS
SELECT
    org_id,
    env,
    customer_id,
    event_name,
    date_trunc('hour', timestamp) as period_hour,
    sum(
        case
            when isNotNull(JSONExtractString(properties, 'value')) AND JSONExtractString(properties, 'value') != ''
                then round(toFloat64OrZero(JSONExtractString(properties, 'value')), 6)
            when isNotNull(value)
                then round(toFloat64(value), 6)
            else 1.0
        end
    ) as value
FROM events
WHERE set_usage = false
  AND timestamp IS NOT NULL
GROUP BY
    org_id,
    env,
    customer_id,
    event_name,
    date_trunc('hour', timestamp);

