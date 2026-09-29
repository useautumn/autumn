import {
	AffectedResource,
	type ListPurchasesResponse,
	ListSubscriptionsParamsSchema,
	Scopes,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { customerProductToPurchaseRow } from "../actions/customerProductToListRow.js";
import { listCustomerProducts } from "../actions/listCustomerProducts.js";

export const handleListPurchases = createRoute({
	scopes: [Scopes.Customers.Read],
	body: ListSubscriptionsParamsSchema,
	resource: AffectedResource.Customer,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const params = c.req.valid("json");

		const page = await listCustomerProducts({ ctx, params, kind: "purchase" });
		const list = await Promise.all(
			page.list.map((customerProduct) =>
				customerProductToPurchaseRow({ ctx, customerProduct }),
			),
		);

		return c.json<ListPurchasesResponse>({ ...page, list });
	},
});
