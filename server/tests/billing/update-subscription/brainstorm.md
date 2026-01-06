update boolean features
- add / remove boolean features
- no invoice created, subscription stays the same

### update included usage

Notes:
- included usage changes
- usage stays the same

Cases:
- update included usage on multiple features
- update included usage on paid features
  -> prepaid feature price: nothing changes
  -> allocated feature price: price in Stripe changes, proration created for difference in overage
  -> consumable feature price (unsure of effects yet, but handle this case)
  -> updating multiple paid features at once

update price

update-edge-cases
- update max purchase, etc.


Unit Tests: