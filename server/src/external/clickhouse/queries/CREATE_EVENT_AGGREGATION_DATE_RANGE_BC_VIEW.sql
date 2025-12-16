CREATE or replace VIEW event_aggregation_date_range_bc_view AS
SELECT
    CASE
        WHEN {bin_size:String} = 'hour' THEN
            date_trunc('hour', {start_date:DateTime} - interval {interval_offset:UInt32} hour) + interval number hour
        WHEN {bin_size:String} = 'month' THEN
            date_trunc('month', {start_date:DateTime} - interval {interval_offset:UInt32} month) + interval number month
        ELSE
            date_trunc('day', {start_date:DateTime} - interval {interval_offset:UInt32} day) + interval number day
    END as period
FROM numbers({bin_count:UInt32});
