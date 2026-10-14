import type { FullCustomer, SubscriptionMismatch } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { CusService } from "@/internal/customers/CusService";

export const evaluateSharedStripeCustomer = async ({
	ctx,
	fullCustomer,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
}): Promise<SubscriptionMismatch[]> => {
	const stripeCustomerId = fullCustomer.processor?.id;
	if (!stripeCustomerId) return [];

	const linkedCustomers = await CusService.getAllByStripeId({
		ctx,
		stripeId: stripeCustomerId,
	});

	const otherCustomers = linkedCustomers
		.filter((customer) => customer.internal_id !== fullCustomer.internal_id)
		.map((customer) => ({
			id: customer.id ?? customer.internal_id,
			name: customer.name ?? null,
			email: customer.email ?? null,
		}));

	if (otherCustomers.length === 0) return [];

	return [
		{
			type: "shared_stripe_customer",
			stripe_customer_id: stripeCustomerId,
			other_customer_ids: otherCustomers.map((customer) => customer.id),
			other_customers: otherCustomers,
		},
	];
};
