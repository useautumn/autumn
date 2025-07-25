CREATE OR REPLACE FUNCTION generateEventCountExpressions AS (event_names) ->
arrayStringConcat(
  arrayMap(
    event_name -> concat(
      'coalesce(sumIf(e.value, e.event_name = ''',
      replaceAll(event_name, '''', ''''''),
      '''), 0) as `',
      event_name,
      '_count`'
    ),
    event_names
  ),
  ',\n    '
);