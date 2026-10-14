import { Scopes } from "@autumn/shared";
import { getSvixDashboardUrl } from "../../../external/svix/svixHelpers";
import { createRoute } from "../../../honoMiddlewares/routeHandler";

export const handleGetWebhooksPortal = createRoute({
	scopes: [Scopes.Organisation.Read],
	handler: async (c) => {
		const { env, org } = c.get("ctx");
		const dashboardUrl = await getSvixDashboardUrl({ env, org });
		return c.json({ svix_dashboard_url: dashboardUrl || null });
	},
});
