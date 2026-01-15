# Legacy Log Context Structure

Reference document for the current log context structure across all pathways. Use this when migrating legacy code to the new typed logging utilities.

## 1. HTTP API Requests (Hono)

**Pathway:** `baseMiddleware` → `analyticsMiddleware` → `logResponse`

```json
{
  "context": {
    "req": {
      "id": "local_req_xxx",
      "method": "POST",
      "url": "http://localhost:8080/v1/subscriptions/update",
      "timestamp": 1768422538125
    },
    "query": { "expand": "customer" },
    "context": {
      "org_id": "org_xxx",
      "org_slug": "my-org",
      "env": "sandbox",
      "authType": "secret_key",
      "body": { "customer_id": "cus_123" },
      "customer_id": "cus_123",
      "user_id": "user_xxx"
    },
    "logs": {}
  },
  "hostname": "...",
  "level": "INFO",
  "msg": "...",
  "pid": 12345
}
```

## 2. HTTP API Requests (Express - Legacy)

**Pathway:** `init.ts` → `middleware/analyticsMiddleware.ts`

```json
{
  "context": {
    "req": {
      "id": "local_req_xxx",
      "method": "POST",
      "url": "/v1/...",
      "timestamp": 1768422538125
    },
    "context": {
      "org_id": "org_xxx",
      "org_slug": "my-org",
      "env": "sandbox",
      "authType": "secret_key",
      "body": {},
      "customer_id": "cus_123",
      "user_id": "user_xxx"
    }
  }
}
```

## 3. Stripe Webhooks

**Pathway:** `baseMiddleware` → `stripeInitLoggerMiddleware`

```json
{
  "context": {
    "req": {},
    "query": {},
    "context": {
      "event_type": "invoice.paid",
      "event_id": "evt_xxx",
      "object_id": "in_xxx",
      "authType": "stripe",
      "org_id": "org_xxx",
      "org_slug": "my-org",
      "env": "sandbox",
      "customer_id": "cus_123"
    }
  }
}
```

## 4. SQS Workers

**Pathway:** `initWorkers.ts` (SQS handler)

```json
{
  "context": {
    "worker": {
      "messageId": "xxx-xxx-xxx",
      "type": "job_name",
      "payload": {}
    }
  }
}
```

## 5. BullMQ Workers

**Pathway:** `initBullMqWorkers.ts` → `createWorkerContext`

**First child (worker meta):**

```json
{
  "context": {
    "worker": {
      "task": "job_name",
      "data": {},
      "jobId": "job_xxx",
      "workerId": 1
    }
  }
}
```

**Second child (app context via createWorkerContext):**

```json
{
  "context": {
    "worker": {},
    "context": {
      "workflow_id": "wf_xxx",
      "org_id": "org_xxx",
      "org_slug": "my-org",
      "customer_id": "cus_123",
      "env": "sandbox",
      "authType": "worker"
    }
  }
}
```

## 6. Migration Jobs

**Pathway:** `createMigrationCustomerLogger`

```json
{
  "context": {
    "context": {
      "migration_job_id": "mig_xxx",
      "org_id": "org_xxx",
      "org_slug": "my-org",
      "customer_id": "cus_123",
      "env": "sandbox",
      "authType": "worker"
    }
  }
}
```

## Summary of Top-Level Context Fields

| Field | Used In | Description |
|-------|---------|-------------|
| `context.req` | HTTP requests | Request metadata (id, method, url, timestamp) |
| `context.query` | HTTP requests | Query parameters |
| `context.context` | All pathways | Business context (org, customer, env, auth, etc.) |
| `context.worker` | SQS/BullMQ workers | Worker metadata (task, jobId, payload, etc.) |
| `context.logs` | HTTP requests (response) | Custom logs added during request lifecycle |
