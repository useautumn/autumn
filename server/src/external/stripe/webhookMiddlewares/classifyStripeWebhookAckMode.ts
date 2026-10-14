import type Stripe from "stripe";
import { isAutumnOriginatedStripeEvent } from "@/external/stripe/common/autumnStripeIdempotency.js";
import { isAutumnManagedSubscriptionMetadata } from "@/internal/billing/v2/providers/stripe/utils/common/autumnStripeMetadata.js";

export type StripeWebhookAckMode = "early" | "sync";

export const classifyStripeWebhookAckMode = ({
	event,
	now = Date.now(),
}: {
	event: Stripe.Event | undefined;
	now?: number;
}): StripeWebhookAckMode => {
	if (!event) return "early";

	switch (event.type) {
		case "account.application.deauthorized":
			return "sync";

		case "checkout.session.completed":
		case "checkout.session.expired":
			return "sync";

		case "customer.updated":
			return "sync";

		case "invoice.paid": {
			const invoice = event.data.object;
			return invoice.metadata?.autumn_metadata_id ? "sync" : "early";
		}

		case "invoice.finalized": {
			const invoice = event.data.object;
			return invoice.metadata?.vercel_installation_id ||
				invoice.metadata?.autumn_metadata_id
				? "sync"
				: "early";
		}

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

export const isStripeWebhookLockRequired = ({
	event,
}: {
	event: Stripe.Event | undefined;
}): boolean =>
	event?.type === "invoice.created" &&
	event.data.object.billing_reason === "subscription_cycle";
