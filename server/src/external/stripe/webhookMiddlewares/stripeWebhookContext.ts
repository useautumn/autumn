import type { Customer, FullCustomer } from "@autumn/shared";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { StripeWebhookAckMode } from "./classifyStripeWebhookAckMode.js";

/** Never-throwing Redis hooks installed by the idempotency middleware. */
export type StripeWebhookIdempotencyHooks = {
	markCompleted: () => Promise<void>;
	release: () => Promise<void>;
};

export interface StripeWebhookContext extends AutumnContext {
	stripeEvent: Stripe.Event;
	stripeCli: Stripe;
	fullCustomer?: FullCustomer;
	webhookAckMode?: StripeWebhookAckMode;
	webhookIdempotency?: StripeWebhookIdempotencyHooks;
}

export type StripeWebhookHonoEnv = {
	Variables: {
		ctx: StripeWebhookContext;
		validated: boolean;
	};
};
