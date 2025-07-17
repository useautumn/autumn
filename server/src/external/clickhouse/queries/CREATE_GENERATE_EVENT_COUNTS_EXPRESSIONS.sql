CREATE OR REPLACE FUNCTION generateEventCountExpressions AS (event_names) ->
arrayStringConcat(
  arrayMap(
    event_name -> concat(
      'coalesce(sumIf(e.value, e.event_name = ''',
      replaceAll(event_name, '''', ''''''),
      '''), 0) as ',
      replaceRegexpAll(event_name, '[^a-zA-Z0-9]', '_'),
      '_count'
    ),
    event_names
  ),
  ',\n    '
);