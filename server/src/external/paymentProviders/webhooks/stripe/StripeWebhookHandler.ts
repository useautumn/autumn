import type { AppEnv } from "@autumn/shared";
import type { WebhookEvent } from "@autumn/shared/utils/paymentProviders/types.js";
import { ProcessorType } from "@autumn/shared/utils/paymentProviders/types.js";
import { BaseWebhookHandler, type WebhookContext } from "../WebhookHandler.js";
import Stripe from "stripe";
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
		// Webhook signature verification doesn't require organization context
		// Use Stripe SDK directly for verification
		const event = await Stripe.webhooks.constructEventAsync(
			payload,
			signature,
			secret,
		);
		return this.mapStripeWebhookEvent(event);
	}

	private mapStripeWebhookEvent(event: Stripe.Event): WebhookEvent {
		return {
			id: event.id,
			type: event.type,
			data: {
				object: event.data.object,
				previous_attributes: event.data.previous_attributes,
			},
			created: event.created,
			...event,
		};
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

