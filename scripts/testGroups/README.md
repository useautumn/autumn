# Test Groups

Organized test suites for the Autumn test framework.

## Usage

From the project root:

```bash
# Run a specific test group
./scripts/testGroups/g1.sh

# Run with setup
./scripts/testGroups/g1.sh setup
```

From the server directory (legacy):

```bash
./run.sh /path/to/test/group/script.sh
```

## Test Groups

### G1: Upgrade & Downgrade Tests ✅ (Migrated to Bun)
**Status:** Fully migrated to Bun + TypeScript runner  
**Tests:**
- `server/tests/check/basic/*.test.ts`
- `server/tests/attach/basic/*.test.ts`
- `server/tests/attach/upgrade/*.test.ts`
- `server/tests/attach/downgrade/*.test.ts`
- `server/tests/attach/free/*.test.ts`
- `server/tests/attach/addOn/*.test.ts`
- `server/tests/attach/entities/*.test.ts`
- `server/tests/attach/checkout/*.test.ts`

**Features:**
- Live spinner showing current test
- Beautiful success/failure indicators
- Concise error reports
- **Compact mode** for large test suites (reduces screen overflow)

### G2: Migrations, Versions & Others ⏳ (Mocha)
**Status:** Uses Mocha (pending migration)  
**Tests:**
- Migrations
- Version updates
- Prepaid features
- Interval upgrades

### G3: Continuous Use Tests ⏳ (Mocha)
**Status:** Uses Mocha (pending migration)  
**Tests:**
- Entity management
- Usage tracking
- Updates
- Roles

### G4: Merged & Core Tests ⏳ (Mocha)
**Status:** Uses Mocha (pending migration)  
**Tests:**
- Merged subscriptions
- Core cancellation
- Multi-attach scenarios

### G5: Advanced Features ⏳ (Mocha)
**Status:** Uses Mocha (pending migration)  
**Tests:**
- Multi-feature
- Coupons
- Referrals
- Rollovers
- Usage limits

### G6: Alex Integration Tests ⏳ (Mocha)
**Status:** Uses Mocha (pending migration)  
**Tests:**
- End-to-end scenarios
- Product switching
- Topups

## Migration Progress

- ✅ Test runner built (TypeScript + Bun)
- ✅ G1 tests migrated to Bun
- ⏳ G2-G6 pending migration

## Compact Mode 📦

When running many tests (dozens of test files), the standard output can overflow your terminal screen. Use compact mode to see only:
- Recently completed tests (last 3 with tick marks)
- Failed tests summary (updated in real-time)
- Currently running tests (up to 6) with their active test case
- A single line with test stats (progress, passed, failed)
- Full error details at the end

### Usage

**In shell scripts (recommended):**
```bash
# Use BUN_PARALLEL_COMPACT instead of BUN_PARALLEL
BUN_PARALLEL_COMPACT \
  'server/tests/check/basic' \
  'server/tests/attach/basic'
```

**Direct command line:**
```bash
# Add --compact flag
bun scripts/testScripts/runTests.ts server/tests/attach/upgrade --compact

# Combine with other options
bun scripts/testScripts/runTests.ts server/tests/attach/upgrade --compact --max=10
```

### When to Use Compact Mode

- ✅ Running 20+ test files (like in g1.sh)
- ✅ CI/CD pipelines with limited scrollback
- ✅ When you only care about failures
- ❌ Debugging specific tests (use full mode to see progress)
- ❌ Running < 10 test files

## Adding New Test Groups

1. Create a new script in `scripts/testGroups/`
2. Use the TypeScript runner for new tests:
   ```bash
   bun scripts/testScripts/runTests.ts server/tests/your/tests
   ```
3. For large test suites, use `BUN_PARALLEL_COMPACT` instead of `BUN_PARALLEL`
4. Update this README with the test group details

