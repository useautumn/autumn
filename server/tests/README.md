# Autumn Test Suite

This directory contains all tests for the Autumn server application.

## Quick Start

```bash
# Run setup to initialize the test organization
bun tests setup

# Run a specific test group
bun tests g1

# Run a test group with setup
bun tests g1 setup

# Run a specific test file (fuzzy matching)
bun tests basic1
```

## Test Structure

### Test Organization

Tests are organized into logical groups that can be run via shell scripts in `server/shell/`:
- `g1.sh` - Check API tests
- `g2.sh` - Attach API tests (basic, upgrade, downgrade)
- `g3.sh` - Attach API tests (checkout, entities, free, addOn)
- `g4.sh` - Product and pricing tests
- `g5.sh` - Customer and subscription tests
- `g6.sh` - Reward and referral tests

### Test Files

- **setupMain.ts** - Main setup script that clears and initializes the test organization
- **global.ts** - Shared test data (features, products, rewards, etc.)
- **utils/** - Test utilities and helper functions
  - `setup/clearOrg.ts` - Clears test org data
  - `setup/setupOrg.ts` - Sets up test org with features and products
  - `setup.ts` - Re-exports setup utilities
  - `init.ts` - Test initialization helpers
  - `stripeUtils.ts` - Stripe-specific test utilities

## Test Setup Process

The setup process (`setupMain.ts`) does the following:

1. **Clears the test organization** (`clearOrg`):
   - Reconnects Stripe with test credentials
   - Resets the default Stripe account (automatically removes all Stripe resources)
   - Deletes all customers from database
   - Deletes all products from database
   - Deletes all rewards from database
   - Deletes all features from database

2. **Sets up the test organization** (`setupOrg`):
   - Creates all test features
   - Creates all test products with pricing and entitlements
   - Creates all test rewards/coupons
   - Creates all reward triggers (referral programs)
   - Initializes Stripe products if running in parallel mode

## Running Tests

### Setup Command

The `setup` command runs the `setupMain.ts` script to initialize the test environment:

```bash
bun tests setup
```

This is required before running any tests to ensure a clean state.

### Shell Scripts

Shell scripts in `server/shell/` define test groups. Each script:
- Can run setup automatically if "setup" is passed as an argument
- Runs multiple test files in parallel or serial mode
- Uses configuration from `server/shell/config.sh`

Example:
```bash
# Run g1 tests with setup
bun tests g1 setup

# Run g1 tests without setup (assumes setup was already run)
bun tests g1
```

### Individual Test Files

You can run individual test files by name (fuzzy matching):

```bash
# Runs the first matching test file
bun tests basic1

# Runs with path pattern
bun tests attach/basic1
```

The test runner will:
1. Search for matching test files
2. Automatically detect if it's a Bun test or Mocha test
3. Run with the appropriate test runner

## Test Frameworks

Tests can use either:
- **Bun Test** - Files with `from "bun:test"` import (faster)
- **Mocha** - Traditional mocha tests (legacy)

The test runner auto-detects which framework to use based on imports.

## Environment Variables

Required environment variables for tests:
- `TESTS_ORG` - Test organization slug (e.g., "unit-test-org")
- `TESTS_ORG_ID` - Test organization ID
- `STRIPE_TEST_KEY` - Stripe test secret key
- `UNIT_TEST_AUTUMN_SECRET_KEY` - Autumn API secret key for tests
- `UNIT_TEST_AUTUMN_PUBLIC_KEY` - Autumn API public key for tests

## Configuration

Test configuration is defined in `server/shell/config.sh`:

```bash
MOCHA_SETUP="bun tests/setupMain.ts"
MOCHA_CMD="bunx mocha --parallel -j 6 --timeout 10000000 --ignore tests/00_setup.ts"
BUN_CMD="bun test --concurrent"
```

## Best Practices

1. **Always run setup first** - Use `bun tests setup` or `bun tests <group> setup` to ensure clean state
2. **Use parallel execution** - Set `MOCHA_PARALLEL=true` for faster test runs
3. **Isolate test data** - Each test should be independent and not rely on other tests
4. **Clean up resources** - Tests should clean up any resources they create
5. **Use descriptive names** - Test files should have clear, descriptive names

## Internal API Endpoints

The test suite uses internal API endpoints for efficiency:

- `POST /organization/reset_default_account` - Resets the default Stripe account (clears all Stripe data)
  - Only works for `TESTS_ORG_ID`
  - Only works in sandbox environment
  - Faster than manually deleting Stripe resources

## Troubleshooting

### Tests failing with "Org not found"
Run setup: `bun tests setup`

### Stripe errors
Check that `STRIPE_TEST_KEY` is set correctly

### Cache issues
The setup script automatically invalidates cache for test API keys

### Parallel execution issues
If tests interfere with each other, try running in serial mode by setting `MOCHA_PARALLEL=false`
