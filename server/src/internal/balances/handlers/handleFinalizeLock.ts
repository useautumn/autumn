import { FinalizeLockParamsV0Schema, RouteGroup, Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { runFinalizeLock } from "../finalizeLock/runFinalizeLock.js";

export const handleFinalizeLock = createRoute({
	scopes: [Scopes.Balances.Write],
	routeGroup: RouteGroup.Balances,
	body: FinalizeLockParamsV0Schema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const params = c.req.valid("json");

		const response = await runFinalizeLock({ ctx, params });
		const status = ctx.extraLogs.finalizeLockQueuedForReplay ? 202 : 200;

		return c.json(response, status);
	},
});
