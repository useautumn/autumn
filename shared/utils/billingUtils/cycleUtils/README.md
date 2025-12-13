# cycleUtils

## getCycleEnd

Returns the next cycle end after `now`, aligned to the anchor.

**Key behavior:** Cycles extend infinitely in both directions from the anchor. Even if anchor is in the future, we return the next aligned cycle end.

```
anchor: 15:00, now: 10:00, interval: 1 hour
→ cycles: ..., 11:00, 12:00, 13:00, 14:00, 15:00, ...
→ returns: 11:00 (next cycle end after 10:00)
```

This treats anchor as an **alignment point**, not a start time.

