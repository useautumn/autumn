get customer tests

Important apiCusFeature fields:
- granted balance
- purchased balance
- current balance
- usage


1. Free metered feature -- test apiCusFeature fields ()
  - Tracking, should alter current balance
  - Update customer entitlement (through `handleUpdateEntitlement.ts`), should alter current balance (maybe granted balance too? not sure yet), usage should stay the same
  - 

2. Pay per use metered feature (with granted balance)
  - Track a bit of the granted balance: purchased balance should be 0, granted balance should stay the same, current balance should be granted balance - usage, usage should be usage
  - Track into overage: purchased balance should be overage amount, granted balance should stay the same, current balance should be 0
  - 

3. Prepaid features (with granted balance)
  - Granted balance is what was passed into product config, purchased balance is how much was specified in prepaid

4. Max purchase

5. Rollovers

6. Multiple feature balances (one off + metered) -- tests apiCusFeature (stuff should be added) and breakdown field

7. Credit system?
