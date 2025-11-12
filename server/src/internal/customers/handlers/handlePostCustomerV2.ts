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

		const apiCustomer = await getApiCustomer({
			ctx,
			customerId: createCusParams.id || "",
			withAutumnId: with_autumn_id,
			baseData: {
				apiCustomer: baseData.apiCustomer,
				legacyData: baseData.legacyData || {
					cusProductLegacyData: {},
					cusFeatureLegacyData: {},
				},
			},
		});

		return c.json(apiCustomer);
	},
});
