# General Test Guide

## Test Context

All tests have access to `ctx` which contains:
- `ctx.org` - Test organization
- `ctx.db` - Database connection
- `ctx.features` - Organization features

## Initializing Autumn Clients

### Secret Key (Default)
```typescript
const autumnV1 = new AutumnInt({ version: ApiVersion.V1_2 });
```

### Public Key
```typescript
const autumnPublic = new AutumnInt({
  version: ApiVersion.V1_2,
  secretKey: ctx.org.test_pkey!,
});
```

### With Custom Config
```typescript
const autumn = new AutumnInt({
  version: ApiVersion.V1_2,
  orgConfig: { include_past_due: true },
});
```

## API Versions

- `ApiVersion.V0_2` - Legacy v0 API
- `ApiVersion.V1_2` - Current v1 API

## Common Test Patterns

### Wait for Async Processing
```typescript
await new Promise((resolve) => setTimeout(resolve, 2000));
```

### Get Customer with Feature Balance
```typescript
const customer: any = await autumn.customers.get(customerId);
const balance = customer.features[TestFeature.Messages].balance;
const used = customer.features[TestFeature.Messages].used;
```

### Expect Error
```typescript
import { expectAutumnError } from "tests/utils/expectUtils/expectErrUtils.js";

await expectAutumnError({
  errCode: ErrCode.CustomerNotFound,
  func: async () => {
    await autumn.customers.get("invalid-id");
  },
});
```

## Public Key Restrictions

Public keys can only access:
- `GET /v1/products`
- `POST /v1/entitled`
- `POST /v1/check`
- `POST /v1/attach`
- `GET /v1/customers/:customerId`

Public keys CANNOT:
- Send events (`send_event: true` is silently ignored)
- Access other endpoints

## Test Organization

- `beforeAll` - Setup (create customers, products, attach)
- `test` - Individual test cases
- Use descriptive test names with `chalk.yellowBright()`

## Imports

```typescript
import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion, ErrCode } from "@autumn/shared";
import chalk from "chalk";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
```

