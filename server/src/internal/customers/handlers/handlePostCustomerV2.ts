import {
	backwardsChangeActive,
	CreateCustomerParamsSchema,
	CreateCustomerQuerySchema,
	CusExpand,
	V0_2_InvoicesAlwaysExpanded,
} from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { getApiCustomer } from "../cusUtils/apiCusUtils/getApiCustomer.js";
import { getOrCreateApiCustomer } from "../cusUtils/getOrCreateApiCustomer.js";

export const handlePostCustomer = createRoute({
	query: CreateCustomerQuerySchema.extend({
		with_autumn_id: z.boolean().optional(),
	}),

	body: CreateCustomerParamsSchema,

	handler: async (c) => {
		const ctx = c.get("ctx");

		const { expand = [], with_autumn_id } = c.req.valid("query");
		const createCusParams = c.req.valid("json");

		// SIDE EFFECT
		if (
			backwardsChangeActive({
				apiVersion: ctx.apiVersion,
				versionChange: V0_2_InvoicesAlwaysExpanded,
			})
		) {
			expand.push(CusExpand.Invoices);
		}

		const baseData = await getOrCreateApiCustomer({
			ctx,
			customerId: createCusParams.id,
			customerData: createCusParams,
		});

		console.log("Expand:", expand);

		const apiCustomer = await getApiCustomer({
			ctx,
			customerId: createCusParams.id || "",
			expand,
			skipCache: false,
			withAutumnId: with_autumn_id,
			baseData: {
				apiCustomer: baseData.apiCustomer,
				legacyData: baseData.legacyData || {
					cusProductLegacyData: {},
				},
			},
		});

		return c.json(apiCustomer);

		// // Check if cached customer exists
		// const fullCus = await getOrCreateCustomer({
		// 	req: ctx as ExtendedRequest,
		// 	customerId: createCusParams.id,
		// 	customerData: createCusParams,
		// 	expand,
		// 	entityId: createCusParams.entity_id,
		// 	entityData: createCusParams.entity_data,
		// 	withCache: true,
		// });

		// console.log("Full Cus:", fullCus);

		// const customer = await getApiCustomer({
		// 	ctx,
		// 	fullCus: fullCus,
		// 	expand,
		// 	withAutumnId: with_autumn_id,
		// });

		// console.log("Customer:", customer);

		// return c.json(customer);
	},
});
