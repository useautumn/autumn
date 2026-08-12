import {
	type FullCustomer,
	notNullish,
	type SubscriptionMismatch,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { CusService } from "@/internal/customers/CusService";

/** Flags a Stripe customer that more than one Autumn customer points at, and
 * lists the other customers so the collision can be untangled. */
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

	const otherCustomerIds = linkedCustomers
		.filter((customer) => customer.internal_id !== fullCustomer.internal_id)
		.map((customer) => customer.id ?? customer.internal_id)
		.filter(notNullish);

	if (otherCustomerIds.length === 0) return [];

	return [
		{
			type: "shared_stripe_customer",
			stripe_customer_id: stripeCustomerId,
			other_customer_ids: otherCustomerIds,
		},
	];
};
