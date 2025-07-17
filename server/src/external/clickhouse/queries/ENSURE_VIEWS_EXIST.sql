SELECT 
    table_name, 
    view_definition
FROM INFORMATION_SCHEMA.VIEWS 
WHERE table_name = 'date_range_view' 
OR table_name = 'date_range_bc_view'
OR table_name = 'org_events_view'
AND table_schema = 'default';