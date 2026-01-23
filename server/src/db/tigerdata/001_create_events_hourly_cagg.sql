-- Continuous Aggregate: events_hourly
-- Pre-aggregates events by hour for fast dashboard queries
-- 
-- Run this directly on your Tiger Data instance:
-- psql $ANALYTICS_DATABASE_URL -f 001_create_events_hourly_cagg.sql

-- Drop if exists (for re-running)
DROP MATERIALIZED VIEW IF EXISTS events_hourly CASCADE;

-- Create the continuous aggregate
-- Groups by: org_id, env, event_name, customer_id, hour
-- This covers the main query patterns:
--   - Filter by org_id + env (always)
--   - Filter by event_name (via ANY())
--   - Filter by customer_id (optional)
--   - Aggregate by hour/day/week/month (roll up from hourly)
CREATE MATERIALIZED VIEW events_hourly
WITH (timescaledb.continuous) AS
SELECT 
    time_bucket('1 hour', timestamp) AS bucket,
    org_id,
    env,
    event_name,
    customer_id,
    COUNT(*) AS event_count,
    SUM(value) AS value_sum
FROM events
WHERE set_usage = false
GROUP BY bucket, org_id, env, event_name, customer_id
WITH NO DATA;

-- Create indexes for fast lookups
CREATE INDEX idx_events_hourly_org_env_bucket 
ON events_hourly (org_id, env, bucket DESC);

CREATE INDEX idx_events_hourly_org_env_customer 
ON events_hourly (org_id, env, customer_id, bucket DESC);

-- Add refresh policy: refresh every 5 minutes
-- start_offset: how far back to look for changes (3 days)
-- end_offset: don't refresh the most recent hour (still being written to)
SELECT add_continuous_aggregate_policy('events_hourly',
    start_offset => INTERVAL '3 days',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '5 minutes'
);

-- Initial backfill: materialize historical data
-- Adjust the date range as needed for your data
CALL refresh_continuous_aggregate('events_hourly', NULL, NOW() - INTERVAL '1 hour');

-- Verify the aggregate was created
SELECT * FROM timescaledb_information.continuous_aggregates 
WHERE view_name = 'events_hourly';
