import {
	AffectedResource,
	ApiVersion,
	SetupPaymentParamsV0Schema,
	SetupPaymentParamsV1Schema,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { billingActions } from "@/internal/billing/v2/actions";

export const handleSetupPaymentV2 = createRoute({
	versionedBody: {
		latest: SetupPaymentParamsV1Schema,
		[ApiVersion.V1_Beta]: SetupPaymentParamsV0Schema,
	},
	resource: AffectedResource.Customer,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const body = c.req.valid("json");

		const result = await billingActions.setupPayment({
			ctx,
			params: body,
		});

		return c.json(result, 200);
	},
});
