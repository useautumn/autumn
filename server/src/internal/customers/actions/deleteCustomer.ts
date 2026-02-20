import {
	CustomerNotFoundError,
	type DeleteCustomerParams,
} from "@autumn/shared";
import { deleteStripeCustomer } from "@/external/stripe/stripeCusUtils";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { CusService } from "@/internal/customers/CusService";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer";

export const deleteCustomer = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: DeleteCustomerParams;
}) => {
	const { db, org, env, logger } = ctx;

	const { customer_id, delete_in_stripe } = params;

	const customer = await CusService.get({
		db,
		idOrInternalId: customer_id,
		orgId: org.id,
		env,
	});

	if (!customer) {
		throw new CustomerNotFoundError({ customerId: customer_id });
	}

	const response = {
		customer,
		success: true,
	};

	try {
		if (customer.processor?.id && delete_in_stripe) {
			await deleteStripeCustomer({
				org,
				env,
				stripeId: customer.processor.id,
			});
		}
	} catch (error) {
		logger.error(`Error deleting customer in stripe: ${error}`);
		response.success = false;
	}

	await CusService.deleteByInternalId({
		db,
		internalId: customer.internal_id,
		orgId: org.id,
		env,
	});

	// Delete customer and all entity caches atomically
	await deleteCachedFullCustomer({
		customerId: customer.id ?? "",
		ctx,
		source: `deleteCustomer`,
	});
};
