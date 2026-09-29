import {
	AffectedResource,
	ListSubscriptionsParamsSchema,
	type ListSubscriptionsResponse,
	Scopes,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { customerProductToSubscriptionRow } from "../actions/customerProductToListRow.js";
import {
	listCustomerProducts,
	loadPageSubscriptions,
} from "../actions/listCustomerProducts.js";

export const handleListSubscriptions = createRoute({
	scopes: [Scopes.Customers.Read],
	body: ListSubscriptionsParamsSchema,
	resource: AffectedResource.Customer,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const params = c.req.valid("json");

		const page = await listCustomerProducts({
			ctx,
			params,
			kind: "subscription",
		});
		const subscriptions = await loadPageSubscriptions({
			ctx,
			customerProducts: page.list,
		});
		const list = await Promise.all(
			page.list.map((customerProduct) =>
				customerProductToSubscriptionRow({
					ctx,
					customerProduct,
					subscriptions,
				}),
			),
		);

		return c.json<ListSubscriptionsResponse>({ ...page, list });
	},
});
