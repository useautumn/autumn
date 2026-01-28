import { AttachV0ParamsSchema } from "@autumn/shared";
import { createRoute } from "../../../../honoMiddlewares/routeHandler";

export const handleAttachV2 = createRoute({
	body: AttachV0ParamsSchema,
	lock:
		process.env.NODE_ENV !== "development"
			? {
					ttlMs: 120000,
					errorMessage:
						"Attach already in progress for this customer, try again in a few seconds",
					getKey: (c) => {
						const ctx = c.get("ctx");
						const body = c.req.valid("json");
						return `lock:attach:${ctx.org.id}:${ctx.env}:${body.customer_id}`;
					},
				}
			: undefined,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const body = c.req.valid("json");

		ctx.logger.info(
			`=============== RUNNING ATTACH V2 FOR ${body.customer_id} ===============`,
		);

		return c.json({ customer_id: body.customer_id }, 200);
	},
});
