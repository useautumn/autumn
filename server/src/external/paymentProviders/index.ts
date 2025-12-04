/**
 * Payment Provider Abstraction Layer
 * 
 * This module provides a unified interface for working with different
 * payment providers (Stripe, PayPal, Paddle, etc.) without coupling
 * the codebase to a specific provider.
 * 
 * Usage:
 * ```typescript
 * import { createPaymentProvider } from '@/external/paymentProviders';
 * 
 * const provider = createPaymentProvider({ org, env });
 * const customer = await provider.customers.create({ name: 'John', email: 'john@example.com' });
 * ```
 */

// Core types and interfaces
export * from "@autumn/shared/utils/paymentProviders/types.js";

// Provider implementations
export { StripeProvider } from "./stripe/StripeProvider.js";

// Factory
export { createPaymentProvider, isPaymentProviderAvailable } from "./factory.js";

// Utilities
export * from "./utils/customerUtils.js";
export * from "./utils/subscriptionUtils.js";
export * from "./utils/invoiceUtils.js";
export * from "./utils/checkoutUtils.js";

// Webhooks
export * from "./webhooks/WebhookHandler.js";
export * from "./webhooks/stripe/StripeWebhookHandler.js";

