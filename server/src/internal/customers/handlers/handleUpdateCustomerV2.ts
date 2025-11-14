import {
	AffectedResource,
	ApiVersion,
	ErrCode,
	GetCustomerQuerySchema,
	ProcessorType,
	UpdateCustomerParamsSchema,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import { z } from "zod/v4";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import RecaseError from "@/utils/errorUtils.js";
import { notNullish } from "@/utils/genUtils.js";
import { CusService } from "../CusService.js";
import { getApiCustomer } from "../cusUtils/apiCusUtils/getApiCustomer.js";

export const handleUpdateCustomerV2 = createRoute({
	params: z.object({
		customer_id: z.string(),
	}),
	body: UpdateCustomerParamsSchema,
	versionedQuery: {
		latest: GetCustomerQuerySchema,
		[ApiVersion.V1_2]: GetCustomerQuerySchema,
	},
	resource: AffectedResource.Customer,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, org, env, logger } = ctx;
		const { customer_id } = c.req.valid("param");
		const newCusData = c.req.valid("json");
		const { expand } = ctx;

		const originalCustomer = await CusService.get({
			db,
			idOrInternalId: customer_id,
			orgId: org.id,
			env,
		});

		if (!originalCustomer) {
			throw new RecaseError({
				message: `Update customer: Customer ${customer_id} not found`,
				code: ErrCode.CustomerNotFound,
				statusCode: StatusCodes.NOT_FOUND,
			});
		}

		if (newCusData.id === null) {
			throw new RecaseError({
				message: `Update customer: Can't change customer ID to null`,
				code: ErrCode.InvalidUpdateCustomerParams,
				statusCode: StatusCodes.BAD_REQUEST,
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
				throw new RecaseError({
					message: `Update customer: Customer ${newCusData.id} already exists, can't change to this ID`,
					code: ErrCode.DuplicateCustomerId,
					statusCode: StatusCodes.CONFLICT,
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

		const finalCustomer = await CusService.getFull({
			db,
			idOrInternalId: originalCustomer.internal_id,
			orgId: org.id,
			env,
			withEntities: true,
		});

		const customerDetails = await getApiCustomer({
			ctx,
			fullCus: finalCustomer,
		});

		return c.json(customerDetails);
	},
});

