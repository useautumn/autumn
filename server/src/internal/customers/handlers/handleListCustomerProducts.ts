import {
	AffectedResource,
	type CustomerProductsPage,
	ErrCode,
	ListCustomerProductsParamsSchema,
	PaginationType,
	RecaseError,
	Scopes,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { assertWithinOrgPaginationLimit } from "../../misc/edgeConfig/orgLimitsStore.js";
import { CusService } from "../CusService.js";

export const handleListCustomerProducts = createRoute({
	scopes: [Scopes.Customers.Read],
	query: ListCustomerProductsParamsSchema,
	resource: AffectedResource.Customer,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const customerId = c.req.param("customer_id");
		const params = c.req.valid("query");

		if (!customerId) {
			throw new RecaseError({
				message: "Customer ID is required",
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}

		assertWithinOrgPaginationLimit({
			org: ctx.org,
			limit: params.limit,
			type: PaginationType.ListCustomerProducts,
		});

		const page = await CusService.getProductsPage({
			ctx,
			idOrInternalId: customerId,
			params,
		});

		return c.json<CustomerProductsPage>(page);
	},
});
