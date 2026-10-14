import { type Customer, shouldForwardCustomerMetadata } from "@autumn/shared";
import { tryCatch } from "@shared/utils";
import { createStripeCli } from "@/external/connect/createStripeCli";
import { isStripeIdempotencyMismatch } from "@/external/stripe/common/utils/isStripeIdempotencyMismatch";
import { autumnToStripeCustomerMetadata } from "@/external/stripe/customers/utils/autumnToStripeMetadata";
import { buildStripeCustomerIdempotencyKey } from "@/external/stripe/customers/utils/buildIdempotencyKey";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { retryAsync } from "@/utils/retryAsync";
import { findStripeCustomerForAutumnCustomer } from "./findStripeCustomerForAutumnCustomer";
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
		expandTax?: boolean;
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

	const { data: stripeCustomer, error } = await tryCatch(
		stripeCli.customers.create(
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
					...(options.expandTax ? ["tax"] : []),
				],
			},
			idempotencyKey
				? {
						idempotencyKey,
					}
				: undefined,
		),
	);

	if (!error) return stripeCustomer as ExpandedStripeCustomer;
	if (!isStripeIdempotencyMismatch(error)) throw error;

	return retryAsync({
		attempts: 5,
		delayMs: 500,
		run: async () => {
			const existingStripeCustomer = await findStripeCustomerForAutumnCustomer({
				ctx,
				customer,
				expandTax: options.expandTax,
			});
			if (!existingStripeCustomer) throw error;
			return existingStripeCustomer;
		},
	});
};
