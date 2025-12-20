CREATE or replace VIEW date_range_view AS
SELECT
    CASE
        WHEN {bin_size:String} = 'hour' THEN
            date_trunc('hour', now() - interval {days:UInt32} day) + interval number hour
        WHEN {bin_size:String} = 'month' THEN
            date_trunc('month', now() - interval {days:UInt32} day) + interval number month
        ELSE
            date_trunc('day', now() - interval {days:UInt32} day) + interval number day
    END as period
FROM numbers(
    CASE
        WHEN {bin_size:String} = 'hour' THEN {days:UInt32} * 24 + 1
        WHEN {bin_size:String} = 'month' THEN toUInt32(ceil(toFloat64({days:UInt32}) / 30.0)) + 1
        ELSE {days:UInt32} + 1
    END
);
