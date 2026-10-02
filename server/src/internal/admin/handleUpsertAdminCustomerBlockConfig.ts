import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { Scopes } from "@autumn/shared";
import { CustomerBlockConfigSchema } from "@/internal/misc/customerBlocks/customerBlockSchemas.js";
import { updateFullCustomerBlockConfig } from "@/internal/misc/customerBlocks/customerBlockStore.js";

export const handleUpsertAdminCustomerBlockConfig = createRoute({
	scopes: [Scopes.Superuser],
	body: CustomerBlockConfigSchema,
	handler: async (c) => {
		const body = c.req.valid("json");

		await updateFullCustomerBlockConfig({ config: body });

		return c.json({ success: true });
	},
});
