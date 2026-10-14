import type Stripe from "stripe";

const create = ({
	id = "cus_stripe_test",
	discount = null,
}: {
	id?: string;
	discount?: Stripe.Discount | null;
} = {}): Stripe.Customer =>
	({
		id,
		object: "customer",
		email: "test@example.com",
		name: "Test Customer",
		discount,
	}) as Stripe.Customer;

export const stripeCustomers = {
	create,
} as const;
