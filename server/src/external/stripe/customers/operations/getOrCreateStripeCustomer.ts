import {
	type Customer,
	orgDisableStripeWrites,
	ProcessorType,
} from "@autumn/shared";
import { createStripeCustomer } from "@/external/stripe/customers/operations/createStripeCustomer";
import {
	type ExpandedStripeCustomer,
	getExpandedStripeCustomer,
} from "@/external/stripe/customers/operations/getExpandedStripeCustomer";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusService } from "@/internal/customers/CusService";

export const getOrCreateStripeCustomer = async ({
	ctx,
	customer,
	options,
}: {
	ctx: AutumnContext;
	customer: Customer;
	options?: {
		updateDb?: boolean;
		expandTax?: boolean;
	};
}): Promise<ExpandedStripeCustomer | undefined> => {
	const { logger } = ctx;
	const resolvedOptions = {
		updateDb: true,
		...options,
	};

	const currentStripeCustomer = await getExpandedStripeCustomer({
		ctx,
		stripeCustomerId: customer.processor?.id,
		expandTax: resolvedOptions.expandTax,
	});

	if (currentStripeCustomer) return currentStripeCustomer;

	if (orgDisableStripeWrites({ ctx })) return undefined;

	logger.info(`Creating new stripe customer for ${customer.id}`);

	const stripeCustomer = await createStripeCustomer({
		ctx,
		customer,
		options: {
			expandTax: resolvedOptions.expandTax,
		},
	});

	if (resolvedOptions.updateDb) {
		await CusService.update({
			ctx,
			idOrInternalId: customer.id || customer.internal_id,
			update: {
				processor: {
					id: stripeCustomer.id,
					type: ProcessorType.Stripe,
				},
			},
		});
	}

	customer.processor = {
		id: stripeCustomer.id,
		type: ProcessorType.Stripe,
	};

	return stripeCustomer;
};
