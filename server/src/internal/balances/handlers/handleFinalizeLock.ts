import { FinalizeLockParamsV0Schema } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { finalizeLock } from "../finalizeLock/finalizeLock";

export const handleFinalizeLock = createRoute({
	body: FinalizeLockParamsV0Schema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const params = c.req.valid("json");

		return c.json(
			await finalizeLock({
				ctx,
				params,
			}),
		);
	},
});
