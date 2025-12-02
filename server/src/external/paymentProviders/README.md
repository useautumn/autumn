# Payment Provider Abstraction Layer

This module provides a unified interface for working with different payment providers (Stripe, PayPal, Paddle, etc.) without coupling the codebase to a specific provider.

## Overview

The payment provider abstraction consists of:

1. **Core Interface** (`PaymentProvider`) - Defines the contract all providers must implement
2. **Provider Implementations** - Stripe implementation (others can be added)
3. **Factory Pattern** - Creates provider instances based on organization configuration
4. **Utility Functions** - High-level helpers for common operations
5. **Webhook Handlers** - Unified webhook processing

## Usage

### Basic Usage

```typescript
import { createPaymentProvider } from '@/external/paymentProviders';

// Create a provider instance
const provider = createPaymentProvider({ org, env });

// Use provider methods
const customer = await provider.customers.create({
  name: 'John Doe',
  email: 'john@example.com',
});

const subscription = await provider.subscriptions.create({
  customer: customer.id,
  items: [{ price: 'price_123' }],
});
```

### Using Utility Functions

```typescript
import { createPaymentProviderCustomer } from '@/external/paymentProviders';

// Create customer with automatic database updates
const processor = await createPaymentProviderCustomer({
  db,
  org,
  env,
  customer,
  logger,
});
```

### Webhook Handling

```typescript
import { getWebhookHandler } from '@/external/paymentProviders/webhooks/stripe/StripeWebhookHandler';

const handler = getWebhookHandler(ProcessorType.Stripe);
const event = await handler.verifyAndParse(payload, signature, secret);
await handler.handleEvent(event, { org, env, provider });
```

## Adding a New Payment Provider

To add support for a new payment provider (e.g., PayPal):

### 1. Update ProcessorType Enum

```typescript
// shared/models/genModels/genEnums.ts
export enum ProcessorType {
  Stripe = "stripe",
  PayPal = "paypal", // Add new provider
}
```

### 2. Create Provider Implementation

```typescript
// server/src/external/paymentProviders/paypal/PayPalProvider.ts
import { PaymentProvider, ProcessorType } from '@autumn/shared/utils/paymentProviders/types';

export class PayPalProvider implements PaymentProvider {
  getProviderType(): ProcessorType {
    return ProcessorType.PayPal;
  }

  customers = {
    create: async (params) => { /* PayPal implementation */ },
    retrieve: async (id) => { /* PayPal implementation */ },
    // ... implement all required methods
  };

  // ... implement all other required interfaces
}
```

### 3. Update Factory

```typescript
// server/src/external/paymentProviders/factory.ts
import { PayPalProvider } from './paypal/PayPalProvider';

export const createPaymentProvider = ({ org, env, providerType }) => {
  const type = providerType || getDefaultProviderType({ org, env });

  switch (type) {
    case ProcessorType.Stripe:
      return new StripeProvider({ org, env });
    case ProcessorType.PayPal:
      return new PayPalProvider({ org, env }); // Add new case
    default:
      throw new Error(`Unsupported payment provider type: ${type}`);
  }
};
```

### 4. Create Webhook Handler (if needed)

```typescript
// server/src/external/paymentProviders/webhooks/paypal/PayPalWebhookHandler.ts
export class PayPalWebhookHandler extends BaseWebhookHandler {
  async verifyAndParse(payload, signature, secret) {
    // PayPal-specific verification
  }

  async handleEvent(event, context) {
    // PayPal-specific event handling
  }
}
```

### 5. Update Organization Configuration Schema

If the new provider requires organization-level configuration:

```typescript
// shared/models/genModels/processorSchemas.ts
export const PayPalProcessorConfigSchema = z.object({
  client_id: z.string(),
  client_secret: z.string(),
  // ... other config fields
});

export const ProcessorConfigsSchema = z.object({
  stripe: VercelProcessorConfigSchema.optional(),
  paypal: PayPalProcessorConfigSchema.optional(), // Add new config
});
```

## Required Provider Capabilities

All payment providers must support:

### Core Operations
- ✅ Customer CRUD operations
- ✅ Product & Price management
- ✅ Subscription lifecycle (create, update, cancel)
- ✅ Invoice management (create, finalize, pay, void)
- ✅ Checkout session creation
- ✅ Payment method management
- ✅ Coupon/discount management
- ✅ Webhook signature verification

### Optional Operations
- ⚠️ Subscription schedules (not all providers support this)
- ⚠️ Usage-based billing meters (provider-specific)

## Migration Strategy

### Gradual Migration

The abstraction layer is designed to allow gradual migration:

1. **Phase 1**: New code uses the abstraction layer
2. **Phase 2**: Refactor existing code to use utilities
3. **Phase 3**: Fully migrate to abstraction layer

### Backward Compatibility

The Stripe provider implementation maintains full backward compatibility:
- Existing Stripe code continues to work
- Can access underlying Stripe client via `provider.getStripeClient()`
- No breaking changes to existing APIs

## Testing

When adding a new provider:

1. **Unit Tests**: Test provider implementation against interface
2. **Integration Tests**: Test payment flows end-to-end
3. **Webhook Tests**: Test webhook verification and handling
4. **Migration Tests**: Test data migration between providers

## Error Handling

All providers should throw `PaymentProviderError` for consistent error handling:

```typescript
import { PaymentProviderError } from '@autumn/shared/utils/paymentProviders/types';

throw new PaymentProviderError(
  'Payment failed',
  'PAYMENT_FAILED',
  400,
  { invoiceId: 'inv_123' }
);
```

## Type Safety

The abstraction uses TypeScript interfaces to ensure type safety:

- All provider implementations must match the `PaymentProvider` interface
- Type errors will occur if required methods are missing
- Provider-specific types are preserved via `[key: string]: unknown`

## Future Enhancements

Potential improvements:

1. **Provider Feature Detection**: Check which features a provider supports
2. **Multi-Provider Support**: Support multiple providers per organization
3. **Provider Migration Tools**: Automated migration between providers
4. **Provider Analytics**: Track provider performance and errors
5. **Provider Fallback**: Automatic fallback to backup provider

