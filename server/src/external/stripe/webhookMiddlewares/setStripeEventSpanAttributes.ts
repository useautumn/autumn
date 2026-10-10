import type Stripe from "stripe";
import { setRootSpanAttributes } from "@/utils/otel/rootSpan.js";
import type { StripeWebhookAckMode } from "./classifyStripeWebhookAckMode.js";

/** The Stripe event a webhook request is handling, on its HTTP span. A replay job's span does not carry it. */
export const setStripeEventSpanAttributes = ({
	stripeEvent,
	ackMode,
}: {
	stripeEvent: Stripe.Event;
	ackMode?: StripeWebhookAckMode;
}) =>
	setRootSpanAttributes(() => {
		const { object } = stripeEvent.data;
		return {
			"stripe.event.id": stripeEvent.id,
			"stripe.event.type": stripeEvent.type,
			"stripe.object_id": "id" in object ? object.id : undefined,
			"stripe.livemode": stripeEvent.livemode,
			"stripe.webhook.ack_mode": ackMode,
		};
	});
