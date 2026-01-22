# SQS Workflows

Simple async tasks processed by SQS workers.

## Handler Signature

```typescript
// server/src/internal/.../workflows/myWorkflow/myWorkflow.ts

import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { MyWorkflowPayload } from "@/queue/workflows.js";

export const myWorkflow = async ({
  ctx,
  payload,
}: {
  ctx: AutumnContext;
  payload: MyWorkflowPayload;
}) => {
  const { customerId } = payload;
  
  // Your logic here
  ctx.logger.info(`Processing ${customerId}`);
};
```

## Register in initWorkers.ts

```typescript
// server/src/queue/initWorkers.ts

import { myWorkflow } from "@/internal/.../workflows/myWorkflow/myWorkflow.js";

const processMessage = async ({ message, db }) => {
  // ... existing code

  if (job.name === JobName.MyWorkflow) {
    if (!ctx) {
      workerLogger.error("No context found for my workflow job");
      return;
    }
    await myWorkflow({ ctx, payload: job.data });
    return;
  }
  
  // ... rest of handlers
};
```

## Complete Example

```typescript
// server/src/internal/billing/v2/workflows/sendProductsUpdated/sendProductsUpdated.ts

import { sendSvixEvent } from "@/external/svix/svixHelpers.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusService } from "@/internal/customers/CusService.js";
import type { SendProductsUpdatedPayload } from "@/queue/workflows.js";

export const sendProductsUpdated = async ({
  ctx,
  payload,
}: {
  ctx: AutumnContext;
  payload: SendProductsUpdatedPayload;
}) => {
  const { db, org, env } = ctx;
  const { customerProductId, scenario, customerId } = payload;

  const fullCustomer = await CusService.getFull({
    db,
    idOrInternalId: customerId,
    orgId: org.id,
    env,
  });

  // ... build webhook payload

  await sendSvixEvent({
    org,
    env,
    eventType: "customer.products.updated",
    data: { scenario, customer, updated_product },
  });
};
```

## Trigger Helper (Optional)

```typescript
// server/src/internal/billing/v2/workflows/sendProductsUpdated/billingPlanToSendProductsUpdated.ts

import { workflows } from "@/queue/workflows.js";

export const billingPlanToSendProductsUpdated = async ({
  ctx,
  cusProduct,
  scenario,
}: {
  ctx: AutumnContext;
  cusProduct: CustomerProduct;
  scenario: string;
}) => {
  // Skip in tests if configured
  if (ctx.testOptions?.skipWebhooks) return;

  await workflows.triggerSendProductsUpdated({
    orgId: ctx.org.id,
    env: ctx.env,
    customerId: cusProduct.customer_id,
    customerProductId: cusProduct.id,
    scenario,
  });
};
```

## Checklist

1. ☐ Add to `JobName.ts`
2. ☐ Define payload type in `workflows.ts`
3. ☐ Add to `workflowRegistry` with `runner: "sqs"`
4. ☐ Add trigger function to `workflows` export
5. ☐ Create handler file
6. ☐ Add case in `initWorkers.ts` `processMessage`
