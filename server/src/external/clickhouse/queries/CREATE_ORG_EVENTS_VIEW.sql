CREATE OR REPLACE VIEW org_events_view AS
SELECT
    customer_id,
    timestamp,
    event_name,
    case
        when isNotNull(JSONExtractString(properties, 'value')) AND JSONExtractString(properties, 'value') != ''
            then toFloat64OrZero(JSONExtractString(properties, 'value'))
        when isNotNull(value)
            then toFloat64(value)
        else 1.0
    end as value,
    properties
FROM events
WHERE
    set_usage = false
    AND env = {env:String}
    AND if({org_id:String} != '', org_id = {org_id:String}, true)
    AND if({org_slug:String} != '', org_slug = {org_slug:String}, true)