# Track Usage

Send usage events to track feature consumption:

```typescript
import Autumn from "autumn-js";

const autumn = new Autumn({
  secretKey: process.env.AUTUMN_SECRET_KEY,
});

// Track a usage event
await autumn.events.track({
  customerId: "user_123",
  featureId: "api_calls",
  value: 1,
});

// Check if customer can use a feature
const { allowed, remaining } = await autumn.check({
  customerId: "user_123",
  featureId: "api_calls",
});

if (!allowed) {
  // Prompt user to upgrade
}
```

Events are processed in real-time and update customer balances automatically.

