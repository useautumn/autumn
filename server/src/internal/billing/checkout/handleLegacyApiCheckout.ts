import {
	AffectedResource,
	ApiVersion,
	CheckoutParamsV0Schema,
	Scopes,
} from "@autumn/shared";
import { createRoute } from "../../../honoMiddlewares/routeHandler";
import { runCheckout } from "./runCheckout";

export const handleLegacyApiCheckout = createRoute({
	scopes: [Scopes.Billing.Write],
	versionedBody: {
		latest: CheckoutParamsV0Schema,
		[ApiVersion.V1_Beta]: CheckoutParamsV0Schema,
	},
	resource: AffectedResource.Checkout,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const body = c.req.valid("json");

		const checkoutRes = await runCheckout({ ctx, checkoutParams: body });

		return c.json(checkoutRes);
	},
});
