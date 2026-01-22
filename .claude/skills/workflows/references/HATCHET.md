# Hatchet Workflows

For complex workflows needing retries, multi-step, typed outputs, or long delays.

## Workflow Definition

```typescript
// server/src/internal/.../workflows/myWorkflow/myWorkflow.ts

import { hatchet } from "@/external/hatchet/initHatchet.js";
import { createWorkflowTask } from "@/queue/hatchetWorkflows/createWorkflowTask.js";
import { JobName } from "@/queue/JobName.js";

// 1. Define input/output types
export type MyWorkflowInput = {
  orgId: string;
  env: AppEnv;
  customerId: string;
};

type MyWorkflowOutput = {
  myTask: {
    success: boolean;
    message: string;
  };
};

// 2. Create workflow (only if Hatchet enabled)
export const myWorkflow = hatchet?.workflow<MyWorkflowInput, MyWorkflowOutput>({
  name: JobName.MyWorkflow,
});

// 3. Define task
myWorkflow?.task({
  name: JobName.MyWorkflow,
  executionTimeout: "60s",
  fn: createWorkflowTask<MyWorkflowInput, MyWorkflowOutput["myTask"]>({
    handler: async ({ input, autumnContext }) => {
      const { customerId } = input;
      
      // Your logic here
      autumnContext.logger.info(`Processing ${customerId}`);
      
      return {
        success: true,
        message: "Completed",
      };
    },
  }),
});
```

## Register Worker

```typescript
// server/src/queue/initWorkers.ts

import { myWorkflow } from "@/internal/.../workflows/myWorkflow/myWorkflow.js";

export const initHatchetWorker = async () => {
  if (!hatchet) return;

  const worker = await hatchet.worker("hatchet-worker", {
    workflows: [
      verifyCacheConsistency!,
      myWorkflow!,  // Add here
    ],
  });

  worker.start().catch(console.error);
};
```

## Register in queueUtils.ts

```typescript
// server/src/queue/queueUtils.ts

import { myWorkflow } from "@/internal/.../workflows/myWorkflow/myWorkflow.js";

const hatchetWorkflows: Record<JobName, any> = {
  [JobName.VerifyCacheConsistency]: verifyCacheConsistency,
  [JobName.MyWorkflow]: myWorkflow,  // Add here
};
```

## Triggering with Options

```typescript
await workflows.triggerMyWorkflow(payload, {
  delayMs: 5000,
  metadata: {
    workflowId: generateId("workflow"),
    customerId,
  },
});
```

## createWorkflowTask Helper

Provides:
- Automatic `AutumnContext` creation from input
- Error handling with Sentry integration
- Workflow logging context

```typescript
createWorkflowTask<TInput, TOutput>({
  handler: async ({ input, autumnContext }) => {
    // input: Your typed input
    // autumnContext: Full AutumnContext with logger, db, org, env, etc.
    return output;
  },
})
```

## Checklist

1. ☐ Add to `JobName.ts`
2. ☐ Define payload type in `workflows.ts`
3. ☐ Add to `workflowRegistry` with `runner: "hatchet"`
4. ☐ Add trigger function to `workflows` export
5. ☐ Create workflow file with `hatchet?.workflow()` + `.task()`
6. ☐ Add to `hatchetWorkflows` map in `queueUtils.ts`
7. ☐ Add to `initHatchetWorker` workflows array

## SQS vs Hatchet

| Feature | SQS | Hatchet |
|---------|-----|---------|
| Setup complexity | Lower | Higher |
| Typed output | No | Yes |
| Multi-step tasks | No | Yes |
| Configurable timeout | 30s visibility | Per-task |
| Max delay | 15 minutes | Unlimited |
| Observability | CloudWatch | Hatchet UI |
