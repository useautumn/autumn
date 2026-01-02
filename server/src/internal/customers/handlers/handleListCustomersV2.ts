import {
	AffectedResource,
	ApiVersion,
	ListCustomersV2ParamsSchema,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { CusBatchService } from "../CusBatchService.js";

export const handleListCustomersV2 = createRoute({
	versionedBody: {
		latest: ListCustomersV2ParamsSchema,
		[ApiVersion.V2_0]: ListCustomersV2ParamsSchema,
	},
	resource: AffectedResource.Customer,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const body = c.req.valid("json");

		const customers = await CusBatchService.getPage({ ctx, query: body });

		return c.json({
			list: customers,
			total: customers.length,
			limit: body.limit,
			offset: body.offset,
		});
	},
});
