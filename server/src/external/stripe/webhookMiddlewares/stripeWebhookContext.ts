import type { Customer, FullCustomer } from "@autumn/shared";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

export interface StripeWebhookContext extends AutumnContext {
	stripeEvent: Stripe.Event;
	stripeCli: Stripe;
	fullCustomer?: FullCustomer;
}

export type StripeWebhookHonoEnv = {
	Variables: {
		ctx: StripeWebhookContext;
		validated: boolean;
	};
};
