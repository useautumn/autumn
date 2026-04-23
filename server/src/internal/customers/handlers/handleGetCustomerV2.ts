import {
	AffectedResource,
	ApiVersion,
	backwardsChangeActive,
	CustomerExpand,
	ErrCode,
	GetCustomerQuerySchema,
	RecaseError,
	V0_2_InvoicesAlwaysExpanded,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { getApiCustomerByRollout } from "../actions/getApiCustomerByRollout.js";

export const handleGetCustomerV2 = createRoute({
	versionedQuery: {
		latest: GetCustomerQuerySchema,
		[ApiVersion.V2_0]: GetCustomerQuerySchema,
		[ApiVersion.V1_2]: GetCustomerQuerySchema,
	},
	resource: AffectedResource.Customer,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const customerId = c.req.param("customer_id");
		const { expand } = ctx;
		const { with_autumn_id } = c.req.valid("query");

		if (!customerId) {
			throw new RecaseError({
				message: "Customer ID is required",
				code: ErrCode.InvalidRequest,
			});
		}

		if (
			backwardsChangeActive({
				apiVersion: ctx.apiVersion,
				versionChange: V0_2_InvoicesAlwaysExpanded,
			})
		) {
			expand.push(CustomerExpand.Invoices);
		}

		const start = Date.now();

		const customer = await getApiCustomerByRollout({
			ctx,
			customerId,
			source: "handleGetCustomerV2",
			withAutumnId: with_autumn_id,
		});

		const duration = Date.now() - start;
		ctx.logger.debug(`[get-customer] getApiCustomer duration: ${duration}ms`);

		return c.json(customer);
	},
});
