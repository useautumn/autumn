import { Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { AsyncBalanceUpdateConfigSchema } from "@/internal/misc/asyncBalanceUpdate/asyncBalanceUpdateSchemas.js";
import { updateFullAsyncBalanceUpdateConfig } from "@/internal/misc/asyncBalanceUpdate/asyncBalanceUpdateStore.js";

export const handleUpsertAdminAsyncBalanceUpdateConfig = createRoute({
	scopes: [Scopes.Superuser],
	body: AsyncBalanceUpdateConfigSchema,
	handler: async (c) => {
		const config = c.req.valid("json");

		await updateFullAsyncBalanceUpdateConfig({ config });

		return c.json({ success: true });
	},
});
