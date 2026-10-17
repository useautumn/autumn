import { CreateVariantParamsV2Schema, Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { checkCatalogApprovals } from "@/internal/approvals/routeChecks/checkCatalogApprovals.js";
import { createVariant } from "../../../product/actions/createVariant/createVariant.js";
import { getPlanResponse } from "../../productUtils/productResponseUtils/getPlanResponse.js";

export const handleCreateVariantV2 = createRoute({
	scopes: [Scopes.Plans.Write],
	body: CreateVariantParamsV2Schema,
	handler: async (c) => {
		const body = c.req.valid("json");
		const ctx = c.get("ctx");
		// The variant is the new plan; its base plan is only read.
		await checkCatalogApprovals({
			ctx,
			checks: [{ action: "plans.create", planId: body.variant_plan_id }],
		});
		const variant = await createVariant({ ctx, data: body });

		return c.json(
			await getPlanResponse({
				ctx,
				product: variant,
				features: ctx.features,
			}),
		);
	},
});
