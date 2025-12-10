import { createRoute } from "@/honoMiddlewares/routeHandler";

export const handleRevenueCatOauthCallback = createRoute({
	handler(c) {
		return c.json({ success: true });
	},
});
