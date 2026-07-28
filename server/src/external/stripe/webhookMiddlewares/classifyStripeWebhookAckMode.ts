import type Stripe from "stripe";
import { isAutumnOriginatedStripeEvent } from "@/external/stripe/common/autumnStripeIdempotency.js";
import { isAutumnManagedSubscriptionMetadata } from "@/internal/billing/v2/providers/stripe/utils/common/autumnStripeMetadata.js";

export type StripeWebhookAckMode = "early" | "sync";

/**
 * Decides whether a Stripe webhook is acked before processing ("early") or only
 * after processing succeeds ("sync", so a failure 500s and Stripe retries).
 * Sync is reserved for events whose handler is load-bearing: external changes
 * Autumn didn't cause, plus deferred-checkout / period-boundary work that runs
 * ONLY in the webhook. Early-ack keeps Autumn-triggered events from blocking
 * the billing actions that emitted them.
 */
export const classifyStripeWebhookAckMode = ({
	event,
	now = Date.now(),
}: {
	event: Stripe.Event | undefined;
	now?: number;
}): StripeWebhookAckMode => {
	if (!event) return "early";

	switch (event.type) {
		// Sole executor of paid-product activation / abandoned-checkout cleanup.
		case "checkout.session.completed":
		case "checkout.session.expired":
			return "sync";

		// Pure external->Autumn mirror (name/email); cheap and always external.
		case "customer.updated":
			return "sync";

		// Deferred billing plan execution (invoice-mode checkout, 3DS completion).
		case "invoice.paid": {
			const invoice = event.data.object;
			return invoice.metadata?.autumn_metadata_id ? "sync" : "early";
		}

		// Vercel marketplace submission happens only in this webhook.
		case "invoice.finalized": {
			const invoice = event.data.object;
			return invoice.metadata?.vercel_installation_id ? "sync" : "early";
		}

		// Cycle invoices own period-boundary balance resets + arrear billing.
		case "invoice.created": {
			const invoice = event.data.object;
			return invoice.billing_reason === "subscription_cycle" ? "sync" : "early";
		}

		case "customer.subscription.created":
		case "customer.subscription.updated":
		case "customer.subscription.deleted": {
			if (isAutumnOriginatedStripeEvent({ event })) return "early";

			const subscription = event.data.object;
			const { skip } = isAutumnManagedSubscriptionMetadata({
				metadata: subscription.metadata,
				now,
				requireRecent: event.type !== "customer.subscription.created",
			});
			return skip ? "early" : "sync";
		}

		default:
			return "early";
	}
};
