import { AttachLicenseParamsV0Schema, Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { billingActions } from "@/internal/billing/v2/actions/index.js";

export const handlePreviewAttachLicense = createRoute({
	scopes: [Scopes.Billing.Read],
	body: AttachLicenseParamsV0Schema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const body = c.req.valid("json");
		const previewResult = await billingActions.attachLicense({
			ctx,
			params: body,
			preview: true,
		});

		return c.json(previewResult);
	},
});
