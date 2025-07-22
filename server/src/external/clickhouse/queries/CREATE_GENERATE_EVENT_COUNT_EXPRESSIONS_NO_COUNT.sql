CREATE OR REPLACE FUNCTION generateEventCountExpressionsNoCount AS (event_names) ->
arrayStringConcat(
  arrayMap(
    event_name -> concat(
      'coalesce(sumIf(e.value, e.event_name = ''',
      replaceAll(event_name, '''', ''''''),
      '''), 0) as `',
      event_name,
      '`'
    ),
    event_names
  ),
  ',\n'
);