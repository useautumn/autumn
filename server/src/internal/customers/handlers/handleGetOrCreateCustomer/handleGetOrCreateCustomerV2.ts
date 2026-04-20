import {
	AffectedResource,
	CreateCustomerParamsV1Schema,
	CustomerDataSchema,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { getOrCreateApiCustomerByRollout } from "@/internal/customers/actions/getOrCreateApiCustomerByRollout.js";
import { isFullSubjectRolloutEnabled } from "@/internal/misc/rollouts/fullSubjectRolloutUtils.js";

export const handleGetOrCreateCustomerV2 = createRoute({
	resource: AffectedResource.Customer,
	body: CreateCustomerParamsV1Schema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const createCusParams = c.req.valid("json");

		const start = Date.now();

		const customerData = CustomerDataSchema.parse(createCusParams);
		const customerId = createCusParams.customer_id;

		const apiCustomer = await getOrCreateApiCustomerByRollout({
			ctx,
			params: {
				customer_id: customerId,
				customer_data: customerData,
				entity_id: createCusParams.entity_id,
				entity_data: createCusParams.entity_data,
			},
			source: "handleGetOrCreateCustomerV2",
			withAutumnId: createCusParams.with_autumn_id,
		});

		const duration = Date.now() - start;
		ctx.logger.debug(
			`[post-customer] path=${isFullSubjectRolloutEnabled({ ctx }) ? "v2" : "v1"} duration: ${duration}ms`,
		);

		return c.json(apiCustomer);
	},
});
