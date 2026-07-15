import { Scopes, UpdateLicenseParamsSchema } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { billingActions } from "@/internal/billing/v2/actions/index.js";

export const handlePreviewUpdateLicense = createRoute({
	scopes: [Scopes.Billing.Read],
	body: UpdateLicenseParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const body = c.req.valid("json");
		const previewResult = await billingActions.updateLicense({
			ctx,
			params: body,
			preview: true,
		});

		return c.json(previewResult);
	},
});
