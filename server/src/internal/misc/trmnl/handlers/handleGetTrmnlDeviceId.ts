import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { Scopes } from "@autumn/shared";
import { CacheManager } from "@/utils/cacheUtils/CacheManager.js";

/**
 * Get TRMNL device configuration for the authenticated organization
 */
export const handleGetTrmnlDeviceId = createRoute({
	scopes: [Scopes.Organisation.Read],
	handler: async (c) => {
		const { org } = c.get("ctx");

		const trmnlConfig = await CacheManager.getJson<{
			deviceId: string;
			hideRevenue: boolean;
		}>(`trmnl:org:${org.id}`);

		return c.json({ trmnlConfig });
	},
});
