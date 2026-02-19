# BillingUpdateBillingBehavior

How to handle billing when updating an existing subscription. 'prorate_immediately' charges/credits prorated amounts now, 'next_cycle_only' skips creating any charges and applies the change at the next billing cycle.


## Values

| Name                  | Value                 |
| --------------------- | --------------------- |
| `PRORATE_IMMEDIATELY` | prorate_immediately   |
| `NEXT_CYCLE_ONLY`     | next_cycle_only       |