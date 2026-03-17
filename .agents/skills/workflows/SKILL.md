---
name: workflows
description: Create async background tasks (workflows) using SQS or Hatchet. Use when building queue jobs, background processing, or async tasks.
---

## Overview

Workflows are async tasks processed by background workers. Two runners:

| Runner | Use Case | Features |
|--------|----------|----------|
| **SQS** | Simple fire-and-forget tasks | Fast, no dependencies, max 15min delay |
| **Hatchet** | Complex workflows needing retries, multi-step, or long delays | Typed outputs, configurable timeouts, observability |

## Quick Start

### 1. Add Job Name

```typescript
// server/src/queue/JobName.ts
export enum JobName {
  // ... existing
  MyNewWorkflow = "my-new-workflow",
}
```

### 2. Define Payload & Register

```typescript
// server/src/queue/workflows.ts

// Add payload type
export type MyNewWorkflowPayload = {
  orgId: string;
  env: AppEnv;
  customerId: string;
  // ... your fields
};

// Add to registry
const workflowRegistry = {
  // ... existing
  myNewWorkflow: {
    jobName: JobName.MyNewWorkflow,
    runner: "sqs",  // or "hatchet"
  } as WorkflowConfig<MyNewWorkflowPayload>,
};

// Add trigger function
export const workflows = {
  // ... existing
  triggerMyNewWorkflow: (payload: MyNewWorkflowPayload, options?: TriggerOptions) =>
    triggerWorkflow({ name: "myNewWorkflow", payload, options }),
};
```

### 3. Create Handler

**For SQS:** See [references/SQS.md](references/SQS.md)

**For Hatchet:** See [references/HATCHET.md](references/HATCHET.md)

### 4. Trigger from Code

```typescript
import { workflows } from "@/queue/workflows.js";

await workflows.triggerMyNewWorkflow({
  orgId: ctx.org.id,
  env: ctx.env,
  customerId,
});

// With delay
await workflows.triggerMyNewWorkflow(payload, { delayMs: 5000 });
```

## File Structure

```
server/src/
├── queue/
│   ├── JobName.ts              # Job name enum
│   ├── workflows.ts            # Registry + triggers
│   └── initWorkers.ts          # SQS message routing
└── internal/.../workflows/
    └── myNewWorkflow/
        ├── myNewWorkflow.ts    # Handler
        └── triggerMyNewWorkflow.ts  # (optional) trigger helper
```

## Required Payload Fields

All workflows must include:
```typescript
{
  orgId: string;
  env: AppEnv;
  customerId?: string;  // optional but common
}
```

## References

- [references/SQS.md](references/SQS.md) - SQS workflow implementation
- [references/HATCHET.md](references/HATCHET.md) - Hatchet workflow implementation
