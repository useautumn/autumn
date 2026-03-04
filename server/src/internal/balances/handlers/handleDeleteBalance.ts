import { DeleteBalanceParamsV0Schema } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { deleteBalance } from "../deleteBalance/deleteBalance";

export const handleDeleteBalance = createRoute({
	body: DeleteBalanceParamsV0Schema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const params = c.req.valid("json");

		await deleteBalance({
			ctx,
			params,
		});

		return c.json({ success: true });
	},
});
