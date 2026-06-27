import {
	CreateVariantParamsV2Schema,
	Scopes,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { createVariant } from "../../../product/actions/createVariant/createVariant.js";
import { getPlanResponse } from "../../productUtils/productResponseUtils/getPlanResponse.js";

export const handleCreateVariantV2 = createRoute({
	scopes: [Scopes.Plans.Write],
	body: CreateVariantParamsV2Schema,
	handler: async (c) => {
		const body = c.req.valid("json");
		const ctx = c.get("ctx");
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
