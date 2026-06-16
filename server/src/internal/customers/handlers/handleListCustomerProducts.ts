import {
	AffectedResource,
	type CursorPaginatedResponse,
	ErrCode,
	type FullCusProduct,
	ListCustomerProductsParamsSchema,
	PaginationType,
	RecaseError,
	Scopes,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { getOrgPaginationMaxLimit } from "../../misc/edgeConfig/orgLimitsStore.js";
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

		const maxLimit = getOrgPaginationMaxLimit({
			orgId: ctx.org.id,
			orgSlug: ctx.org.slug,
			type: PaginationType.ListCustomerProducts,
		});
		if (params.limit > maxLimit) {
			throw new RecaseError({
				message: `limit ${params.limit} exceeds max of ${maxLimit} for this org`,
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}

		const page = await CusService.getProductsPage({
			ctx,
			idOrInternalId: customerId,
			params,
		});

		return c.json<
			CursorPaginatedResponse<FullCusProduct> & { total_count: number }
		>(page);
	},
});
