import {
	Scopes,
	UpdateOrganizationParamsSchema,
	UpdateOrganizationResponseSchema,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { updateOrganization } from "../../actions/updateOrganization/updateOrganization.js";

export const handleUpdateOrganization = createRoute({
	scopes: [Scopes.Organisation.Write],
	body: UpdateOrganizationParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { config } = c.req.valid("json");

		const result = await updateOrganization({ ctx, stated: config ?? {} });

		return c.json(UpdateOrganizationResponseSchema.parse(result));
	},
});
