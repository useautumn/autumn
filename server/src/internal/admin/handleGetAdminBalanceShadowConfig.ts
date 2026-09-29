import { Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { balanceShadowStore } from "@/internal/balances/shadow/balanceShadowStore.js";

export const handleGetAdminBalanceShadowConfig = createRoute({
	scopes: [Scopes.Superuser],
	handler: async (c) => c.json(await balanceShadowStore.readFromSource()),
});
