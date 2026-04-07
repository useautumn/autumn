import { type Customer, shouldForwardCustomerMetadata } from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli";
import { autumnToStripeCustomerMetadata } from "@/external/stripe/customers/utils/autumnToStripeMetadata";
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

	const forwardCustomerMetadata = shouldForwardCustomerMetadata({
		org: ctx.org,
	});

	const stripeCustomer = await stripeCli.customers.create(
		{
			name: customer.name || undefined,
			email: customer.email || undefined,
			metadata: {
				autumn_id: customer.id || null,
				autumn_internal_id: customer.internal_id,
				...(forwardCustomerMetadata &&
					autumnToStripeCustomerMetadata({ metadata: customer.metadata })),
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
