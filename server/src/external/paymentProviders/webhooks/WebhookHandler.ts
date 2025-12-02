import type { AppEnv, Organization } from "@autumn/shared";
import type { PaymentProvider, WebhookEvent } from "@autumn/shared/utils/paymentProviders/types.js";
import { createPaymentProvider } from "../factory.js";

/**
 * Generic webhook handler interface
 * 
 * This provides a unified interface for handling webhooks from different
 * payment providers. Each provider should implement provider-specific handlers.
 */
export interface PaymentProviderWebhookHandler {
	/**
	 * Verify webhook signature and parse event
	 */
	verifyAndParse(
		payload: string | Buffer,
		signature: string,
		secret: string,
	): Promise<WebhookEvent>;

	/**
	 * Handle webhook event
	 */
	handleEvent(event: WebhookEvent, context: WebhookContext): Promise<void>;
}

export interface WebhookContext {
	org: Organization;
	env: AppEnv;
	provider: PaymentProvider;
	[key: string]: unknown;
}

/**
 * Base webhook handler that can be extended by provider-specific implementations
 */
export abstract class BaseWebhookHandler implements PaymentProviderWebhookHandler {
	abstract verifyAndParse(
		payload: string | Buffer,
		signature: string,
		secret: string,
	): Promise<WebhookEvent>;

	abstract handleEvent(event: WebhookEvent, context: WebhookContext): Promise<void>;
}

