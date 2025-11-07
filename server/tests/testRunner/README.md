# Parallel Test Runner

This directory contains the infrastructure for running tests in parallel across multiple isolated Autumn organizations.

## Overview

The parallel test system solves the Stripe rate limiting problem by:
1. Dividing tests into **groups**
2. Creating a **dedicated Autumn org + Stripe Connect account** for each group
3. Running all groups **in parallel**

Each test group runs independently with its own organization, eliminating rate limiting and data conflicts.

## Architecture

```
┌─────────────────────────────────────────┐
│   runParallelGroups.ts                  │
│   - Orchestrates all test groups       │
│   - Runs groups in parallel             │
└─────────────────────────────────────────┘
            │
            ├──────────────┬──────────────┐
            ▼              ▼              ▼
    ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
    │ groupRunner  │ │ groupRunner  │ │ groupRunner  │
    │ (upgrade)    │ │ (basic)      │ │ (...)        │
    └──────────────┘ └──────────────┘ └──────────────┘
            │              │              │
            ▼              ▼              ▼
    ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
    │ Org + Stripe │ │ Org + Stripe │ │ Org + Stripe │
    │ test-upgrade │ │ test-basic   │ │ test-...     │
    └──────────────┘ └──────────────┘ └──────────────┘
```

## Files

- **`config.ts`** - Defines test groups (slug + paths)
- **`runParallelGroups.ts`** - Main entry point, runs all groups in parallel
- **`groupRunner.ts`** - Handles setup/execution for a single group
- **`runTests.ts`** - Test runner for files within a group (runs tests with concurrency limit)

## Setup

### 1. Environment Variables

Add to `server/.env`:

```bash
# Secret key of your platform org (must have platform API access)
TEST_ORG_SECRET_KEY=am_sk_test_...

# Optional: Override base URL (defaults to http://localhost:8080)
BASE_URL=http://localhost:8080
```

### 2. Configure Test Groups

Edit `config.ts` to define your test groups:

```typescript
export const testGroups: TestGroup[] = [
  {
    slug: "test-upgrade",
    paths: ["server/tests/attach/upgrade"],
  },
  {
    slug: "test-basic",
    paths: ["server/tests/attach/basic"],
  },
  // Add more groups...
];
```

**Guidelines:**
- Each group gets its own org (slug must be unique)
- Group related tests together to minimize setup overhead
- Balance group sizes for optimal parallel execution

## Usage

### Run All Groups in Parallel

```bash
# From server directory (recommended)
cd server
bun parallel-tests

# Or from project root
bun server/tests/testRunner/runParallelGroups.ts
```

### Run a Single Group (for debugging)

```bash
# Set env vars manually
export TESTS_ORG="test-upgrade"
export UNIT_TEST_AUTUMN_SECRET_KEY="am_sk_test_..."

# Run tests
bun server/tests/testRunner/runTests.ts server/tests/attach/upgrade --compact
```

## How It Works

### For Each Test Group:

1. **DELETE** existing org (cleanup from previous runs)
   - `DELETE /v1/platform/beta/organizations` with `{ slug: "test-upgrade" }`

2. **CREATE** new org via Platform API
   - `POST /v1/platform/beta/organizations`
   - Returns `test_secret_key` for the new org

3. **RUN TESTS** with isolated environment
   - Spawns `runTests.ts` with env vars:
     - `UNIT_TEST_AUTUMN_SECRET_KEY` - org's secret key
     - `TESTS_ORG` - org slug
   - Tests use `createTestContext()` which reads these env vars
   - `AutumnInt` client reads `UNIT_TEST_AUTUMN_SECRET_KEY`

4. **AGGREGATE** results across all groups

### Environment Isolation

Each group runs in a **separate process** with its own env vars, ensuring complete isolation:

```typescript
spawn(["bun", "runTests.ts", ...paths], {
  env: {
    ...process.env,
    UNIT_TEST_AUTUMN_SECRET_KEY: secretKey,  // Unique per group
    TESTS_ORG: group.slug,                   // Unique per group
  },
});
```

## Testing the System

### Milestone 1: Two Groups

The initial implementation runs two groups in parallel:
- `test-upgrade` - Runs `server/tests/attach/upgrade`
- `test-basic` - Runs `server/tests/attach/basic`

To test:

```bash
# Terminal 1: Make sure server is running
cd server
bun run dev

# Terminal 2: Run parallel tests
cd server
bun parallel-tests
```

Expected output:
```
======================================================================
  PARALLEL TEST RUNNER
======================================================================
Running 2 test groups in parallel...

[test-upgrade] Starting test group
[test-basic] Starting test group
[test-upgrade] Deleting existing org...
[test-basic] Deleting existing org...
[test-upgrade] Creating new org...
[test-basic] Creating new org...
...
```

## Troubleshooting

### "TEST_ORG_SECRET_KEY not found"

Make sure you've added `TEST_ORG_SECRET_KEY` to `server/.env` and it's the secret key of a platform org with platform API access.

### "Org not found" during tests

The org slug in `config.ts` must match exactly what gets created. Check the platform API response to see what slug was actually created.

### Tests fail with rate limiting

If you still hit rate limits, your groups might be too large. Split them into smaller groups in `config.ts`.

### "Cannot delete org with production mode customers"

Make sure you're only using test mode for these test orgs. The DELETE endpoint won't delete orgs with live customers for safety.

## Next Steps

1. **Add more test groups** to `config.ts` as you migrate tests
2. **Run in CI** - Add `.github/workflows/parallel-tests.yml`
3. **Cleanup strategy** - Add periodic cleanup of old test orgs (optional)
4. **Migrate legacy tests** - Update tests that use `global.ts` to use the new system

## Legacy Test Files

These test files currently import from `global.ts` and need migration:
- `tests/core/cancel/cancel5.test.ts`
- Several files in `tests/attach/basic/`
- Several files in `tests/attach/downgrade/`

Migration is not required for the parallel system to work - these can continue using the old approach.
