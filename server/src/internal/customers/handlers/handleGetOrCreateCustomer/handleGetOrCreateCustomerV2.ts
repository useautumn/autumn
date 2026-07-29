import {
    AffectedResource,
    CreateCustomerParamsV1Schema,
    CustomerDataSchema,
    Scopes,
} from "@autumn/shared";
import type { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getOrCreateApiCustomerByRollout } from "@/internal/customers/actions/getOrCreateApiCustomerByRollout.js";
import { applySubjectLookupDbOnly } from "@/internal/misc/miscellaneousEdgeConfig/applySubjectLookupDbOnly.js";
import { isFullSubjectRolloutEnabled } from "@/internal/misc/rollouts/fullSubjectRolloutUtils.js";

export const getOrCreateCustomerV2 = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: z.infer<typeof CreateCustomerParamsV1Schema>;
}) => {
	const start = Date.now();
	const customerData = CustomerDataSchema.parse(params);

	const apiCustomer = await getOrCreateApiCustomerByRollout({
		ctx,
		params: {
			customer_id: params.customer_id,
			customer_data: customerData,
			entity_id: params.entity_id,
			entity_data: params.entity_data,
		},
		source: "handleGetOrCreateCustomerV2",
		withAutumnId: params.with_autumn_id,
	});

	const duration = Date.now() - start;
	ctx.logger.debug(
		`[post-customer] path=${isFullSubjectRolloutEnabled({ ctx }) ? "v2" : "v1"} duration: ${duration}ms`,
	);

	return apiCustomer;
};

export const handleGetOrCreateCustomerV2 = createRoute({
	scopes: { ANY: [Scopes.Customers.Write, Scopes.Customers.Read] },
	resource: AffectedResource.Customer,
	body: CreateCustomerParamsV1Schema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const params = c.req.valid("json");

		applySubjectLookupDbOnly({ ctx });

		const apiCustomer = await getOrCreateCustomerV2({ ctx, params });
		
		return c.json(apiCustomer);
	},
});
