import {
	AffectedResource,
	ApiVersion,
	CustomerAlreadyExistsError,
	CustomerNotFoundError,
	GetCustomerQuerySchema,
	ProcessorType,
	RecaseError,
	UpdateCustomerParamsSchema,
} from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";

import { notNullish } from "@/utils/genUtils.js";
import { CusService } from "../CusService.js";
import { getApiCustomer } from "../cusUtils/apiCusUtils/getApiCustomer.js";
import { deleteCachedFullCustomer } from "../cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer.js";
import { getOrSetCachedFullCustomer } from "../cusUtils/fullCustomerCacheUtils/getOrSetCachedFullCustomer.js";

export const handleUpdateCustomerV2 = createRoute({
	body: UpdateCustomerParamsSchema,
	versionedQuery: {
		latest: GetCustomerQuerySchema,
		[ApiVersion.V1_2]: GetCustomerQuerySchema,
	},
	resource: AffectedResource.Customer,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, org, env, logger } = ctx;
		const { customer_id } = c.req.param();
		const newCusData = c.req.valid("json");

		const originalCustomer = await CusService.get({
			db,
			idOrInternalId: customer_id,
			orgId: org.id,
			env,
		});

		if (!originalCustomer) {
			throw new CustomerNotFoundError({ customerId: customer_id });
		}

		if (newCusData.id === null) {
			throw new RecaseError({
				message: `Update customer: Can't change customer ID to null`,
			});
		}

		if (notNullish(newCusData.id) && originalCustomer.id !== newCusData.id) {
			// Fetch for existing customer
			const existingCustomer = await CusService.get({
				db,
				idOrInternalId: newCusData.id,
				orgId: org.id,
				env,
			});

			if (existingCustomer) {
				throw new CustomerAlreadyExistsError({
					message: `Customer with ID ${newCusData.id} already exists, can't change to this ID`,
					customerId: newCusData.id,
				});
			}
		}

		// Try to update stripe ID
		let stripeId = originalCustomer.processor?.id;
		const newStripeId = newCusData.stripe_id;

		if (notNullish(newStripeId) && stripeId !== newStripeId) {
			const stripeCli = createStripeCli({ org, env });
			await stripeCli.customers.retrieve(newStripeId);

			stripeId = newCusData.stripe_id;
			logger.info(
				`Updating customer's Stripe ID from ${originalCustomer.processor?.id} to ${stripeId}`,
			);
		}

		// Check if customer email is being changed
		const oldMetadata = originalCustomer.metadata || {};
		const newMetadata = newCusData.metadata || {};
		for (const key in newMetadata) {
			if (newMetadata[key] === null) {
				delete newMetadata[key];
				delete oldMetadata[key];
			}
		}

		const stripeUpdate = {
			email:
				originalCustomer.email !== newCusData.email
					? newCusData.email
					: undefined,
			name:
				originalCustomer.name !== newCusData.name ? newCusData.name : undefined,
		};

		if (Object.keys(stripeUpdate).length > 0 && stripeId) {
			const stripeCli = createStripeCli({ org, env });
			await stripeCli.customers.update(stripeId, stripeUpdate as any);
		}

		// Prepare update data
		const updateData: any = {
			...newCusData,
			metadata: {
				...oldMetadata,
				...newMetadata,
			},
		};

		// Only set processor if newStripeId is provided
		if (newStripeId) {
			updateData.processor = { id: newStripeId, type: ProcessorType.Stripe };
		}

		// Remove id from update if not changing
		if (!notNullish(newCusData.id) || originalCustomer.id === newCusData.id) {
			delete updateData.id;
		}

		await CusService.update({
			db,
			idOrInternalId: originalCustomer.internal_id,
			orgId: org.id,
			env,
			update: updateData,
		});

		// Invalidate cache after DB update
		await deleteCachedFullCustomer({
			customerId: customer_id,
			ctx,
			source: "handleUpdateCustomerV2",
		});

		// Skip cache to get fresh data after update
		ctx.skipCache = true;
		const fullCustomer = await getOrSetCachedFullCustomer({
			ctx,
			customerId: newCusData.id ?? customer_id,
			source: "handleUpdateCustomerV2",
		});

		const customerDetails = await getApiCustomer({
			ctx,
			fullCustomer,
		});

		return c.json(customerDetails);
	},
});
