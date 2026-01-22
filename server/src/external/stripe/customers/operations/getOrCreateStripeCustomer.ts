import { type Customer, ProcessorType } from "@autumn/shared";
import { createStripeCustomer } from "@/external/stripe/customers/operations/createStripeCustomer";
import { getExpandedStripeCustomer } from "@/external/stripe/customers/operations/getExpandedStripeCustomer";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusService } from "@/internal/customers/CusService";

export const getOrCreateStripeCustomer = async ({
	ctx,
	customer,
	options = {
		updateDb: true,
	},
}: {
	ctx: AutumnContext;
	customer: Customer;
	options?: {
		updateDb?: boolean;
	};
}) => {
	const { logger, db, org, env } = ctx;

	const currentStripeCustomer = await getExpandedStripeCustomer({
		ctx,
		stripeCustomerId: customer.processor?.id,
	});

	if (currentStripeCustomer) return currentStripeCustomer;

	logger.info(`Creating new stripe customer for ${customer.id}`);

	const stripeCustomer = await createStripeCustomer({
		ctx,
		customer,
	});

	if (options.updateDb) {
		await CusService.update({
			db,
			idOrInternalId: customer.internal_id,
			orgId: org.id,
			env,
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
