import { FinalizeLockParamsV0Schema, Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { runFinalizeLock } from "../finalizeLock/runFinalizeLock.js";

export const handleFinalizeLock = createRoute({
	scopes: [Scopes.Balances.Write],
	body: FinalizeLockParamsV0Schema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const params = c.req.valid("json");

		return c.json(
			await runFinalizeLock({
				ctx,
				params,
			}),
		);
	},
});
