import type { FullCusProduct, FullCustomer } from "@autumn/shared";
import { AppEnv } from "@autumn/shared";
import type Stripe from "stripe";

export const createMockFullCustomer = ({
	customerProducts = [],
}: {
	customerProducts?: FullCusProduct[];
}): FullCustomer => ({
	id: "cus_test",
	name: "Test Customer",
	email: "test@example.com",
	fingerprint: null,
	internal_id: "cus_internal_test",
	org_id: "org_test",
	created_at: Date.now(),
	env: AppEnv.Sandbox,
	processor: { type: "stripe", id: "cus_stripe_test" },
	processors: null,
	metadata: {},
	customer_products: customerProducts,
	entities: [],
});

export const createMockStripeCustomer = ({
	id = "cus_stripe_test",
}: {
	id?: string;
} = {}): Stripe.Customer =>
	({
		id,
		object: "customer",
		email: "test@example.com",
		name: "Test Customer",
	}) as Stripe.Customer;
