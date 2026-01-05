import type { Customer } from "@autumn/shared";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

export interface StripeWebhookContext extends AutumnContext {
	stripeEvent: Stripe.Event;
	stripeCli: Stripe;
	customer?: Customer;
}

export type StripeWebhookHonoEnv = {
	Variables: {
		ctx: StripeWebhookContext;
		validated: boolean;
	};
};
