import { FinalizeLockParamsV0Schema } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { runFinalizeLock } from "../finalizeLock/runFinalizeLock.js";

export const handleFinalizeLock = createRoute({
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
