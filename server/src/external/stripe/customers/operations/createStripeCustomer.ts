import type { Customer } from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli";
import { buildStripeCustomerIdempotencyKey } from "@/external/stripe/customers/utils/buildIdempotencyKey";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { ExpandedStripeCustomer } from "./getExpandedStripeCustomer";

export const createStripeCustomer = async ({
	ctx,
	customer,
	options = {},
}: {
	ctx: AutumnContext;
	customer: Customer;
	options?: {
		testClockId?: string;
	};
}): Promise<ExpandedStripeCustomer> => {
	const { org, env } = ctx;
	const stripeCli = createStripeCli({ org, env });

	const idempotencyKey = buildStripeCustomerIdempotencyKey({
		ctx,
		customerId: customer.id || customer.internal_id,
	});

	const stripeCustomer = await stripeCli.customers.create(
		{
			name: customer.name || undefined,
			email: customer.email || undefined,
			metadata: {
				autumn_id: customer.id || null,
				autumn_internal_id: customer.internal_id,
			},
			test_clock: options.testClockId,
			expand: [
				"test_clock",
				"invoice_settings.default_payment_method",
				"discount.source.coupon.applies_to",
			],
		},
		idempotencyKey
			? {
					idempotencyKey,
				}
			: undefined,
	);

	return stripeCustomer as ExpandedStripeCustomer;
};
