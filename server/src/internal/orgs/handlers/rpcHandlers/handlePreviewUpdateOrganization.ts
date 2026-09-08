import {
	PreviewUpdateOrganizationParamsSchema,
	PreviewUpdateOrganizationResponseSchema,
	Scopes,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { computeOrgSettingChanges } from "../../actions/updateOrganization/computeOrgSettingChanges.js";

/** What organization.update would change, without persisting. Same body. */
export const handlePreviewUpdateOrganization = createRoute({
	scopes: [Scopes.Organisation.Read],
	body: PreviewUpdateOrganizationParamsSchema,
	handler: async (c) => {
		const { org } = c.get("ctx");
		const { config } = c.req.valid("json");

		return c.json(
			PreviewUpdateOrganizationResponseSchema.parse({
				config: {
					changes: computeOrgSettingChanges({
						config: org.config,
						stated: config ?? {},
					}),
				},
			}),
		);
	},
});
