CREATE OR REPLACE VIEW org_events_view
SQL SECURITY DEFINER
AS
SELECT
    customer_id,
    timestamp,
    event_name,
    case
        when isNotNull(value) AND value != 0
            then round(toFloat64(value), 6)
        when isNotNull(JSONExtractString(properties, 'value')) AND JSONExtractString(properties, 'value') != ''
            then round(toFloat64OrZero(JSONExtractString(properties, 'value')), 6)
        else 1.0
    end as value,
    properties
FROM events
WHERE
    set_usage = false
    AND org_id = {org_id:String}
    AND env = {env:String}