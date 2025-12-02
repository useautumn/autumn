import type { AppEnv, Organization } from "@autumn/shared";
import type { WebhookEvent } from "@autumn/shared/utils/paymentProviders/types.js";
import { ProcessorType } from "@autumn/shared/utils/paymentProviders/types.js";
import { BaseWebhookHandler, type WebhookContext } from "../WebhookHandler.js";
import { StripeProvider } from "../../stripe/StripeProvider.js";
import { handleStripeWebhookEvent } from "@/external/stripe/handleStripeWebhookEvent.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

/**
 * Stripe-specific webhook handler
 * 
 * This wraps the existing Stripe webhook handling logic and adapts it
 * to the generic webhook handler interface.
 */
export class StripeWebhookHandler extends BaseWebhookHandler {
	async verifyAndParse(
		payload: string | Buffer,
		signature: string,
		secret: string,
	): Promise<WebhookEvent> {
		const provider = this.createProvider({} as Organization, "sandbox" as AppEnv);
		return provider.webhooks.verifySignature(payload, signature, secret);
	}

	async handleEvent(event: WebhookEvent, context: WebhookContext): Promise<void> {
		// Convert our abstract event to Stripe event format
		const stripeEvent = event as any; // Stripe event format

		// Use existing Stripe webhook handler
		await handleStripeWebhookEvent({
			ctx: context as unknown as AutumnContext,
			event: stripeEvent,
		});
	}

	private createProvider(org: Organization, env: AppEnv): StripeProvider {
		return new StripeProvider({ org, env });
	}
}

/**
 * Get the appropriate webhook handler for a payment provider
 */
export const getWebhookHandler = (
	providerType: ProcessorType,
): BaseWebhookHandler => {
	switch (providerType) {
		case ProcessorType.Stripe:
			return new StripeWebhookHandler();

		default:
			throw new Error(`Unsupported payment provider type for webhooks: ${providerType}`);
	}
};

