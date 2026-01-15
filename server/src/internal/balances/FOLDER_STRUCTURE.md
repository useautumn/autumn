# Balances Folder Structure

## Target Structure

```
balances/
├── balancesRouter.ts
├── handlers/
│   ├── handleTrack.ts
│   └── handleUpdateBalance.ts
│
├── track/                              # Top-level business logic
│   ├── runTrack.ts                     # Single entry point (merge V1/V2)
│   ├── getFeatureDeductions.ts
│   ├── getTrackBalancesResponse.ts
│   └── TRACK_RULES.md
│
├── setUsage/                           # Top-level business logic
│   ├── handleSetUsage.ts
│   └── getSetUsageDeductions.ts
│
├── updateBalance/                      # Top-level business logic
│   ├── runAddToBalance.ts
│   ├── runUpdateBalance.ts
│   └── runRedisUpdateBalance.ts
│
├── updateGrantedBalance/               # Top-level business logic
│   └── updateGrantedBalance.ts
│
└── utils/                              # Infrastructure & shared utilities
    │
    ├── deduction/                      # Core deduction logic
    │   ├── deductionTypes.ts           # Shared types (DeductionParams, etc.)
    │   ├── prepareDeductionInput.ts    # Shared cusEntInput + rollover prep
    │   ├── executePostgresDeduction.ts # Postgres-specific deduction
    │   ├── executeRedisDeduction.ts    # Redis-specific deduction
    │   ├── handlePaidAllocatedCusEnt.ts# Shared post-deduction logic
    │   ├── rollbackDeduction.ts        # Shared rollback
    │   └── validateDeduction.ts        # Pre-deduction validation
    │
    ├── sync/                           # Consolidated sync logic
    │   ├── SyncBatchingManager.ts      # Batches sync operations
    │   ├── syncItem.ts                 # Single sync item handler
    │   └── runSyncBalanceBatch.ts
    │
    ├── events/                         # Event batching & insertion
    │   ├── EventBatchingManager.ts
    │   ├── runInsertEventBatch.ts
    │   └── constructEvent.ts
    │
    ├── redis/                          # Redis-specific utilities
    │   └── luaScripts.ts               # Lua script loader
    │
    └── sql/                            # SQL scripts
        ├── performDeduction.sql
        ├── deductFromMainBalance.sql
        ├── deductFromRollovers.sql
        ├── deductFromAdditionalBalance.sql
        ├── getTotalBalance.sql
        └── syncBalances.sql
```

## Design Principles

- **Top-level folders** (`track/`, `setUsage/`, `updateBalance/`, `updateGrantedBalance/`) = Business logic entry points
- **`utils/`** = Infrastructure code that supports those top-level functions
- **`utils/deduction/`** = Core deduction logic shared between Redis and Postgres paths



TODOS:
1. Remove cus_ent_ids from script input
2. Deal with actualDeductions in executeRedisDeduction
3. Deal with unlimited features