SELECT 
    name,
    create_query
FROM system.functions
WHERE name = 'generateEventCountExpressions'
AND origin = 'SQLUserDefined'