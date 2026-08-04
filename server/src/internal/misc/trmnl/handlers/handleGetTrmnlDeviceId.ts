import { Scopes } from "@autumn/shared";
import { getTrmnlOrgConfig } from "@/external/redis/actions/trmnlDeviceStore/trmnlDeviceStore.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";

/**
 * Get TRMNL device configuration for the authenticated organization
 */
export const handleGetTrmnlDeviceId = createRoute({
	scopes: [Scopes.Organisation.Read],
	handler: async (c) => {
		const { org } = c.get("ctx");

		const trmnlConfig = await getTrmnlOrgConfig({ orgId: org.id });

		return c.json({ trmnlConfig });
	},
});
