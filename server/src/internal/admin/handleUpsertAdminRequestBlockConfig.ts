import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { RequestBlockConfigSchema } from "@/internal/misc/requestBlocks/requestBlockSchemas.js";
import { updateFullRequestBlockConfig } from "@/internal/misc/requestBlocks/requestBlockStore.js";

export const handleUpsertAdminRequestBlockConfig = createRoute({
	body: RequestBlockConfigSchema,
	handler: async (c) => {
		const body = c.req.valid("json");

		await updateFullRequestBlockConfig({ config: body });

		return c.json({ success: true });
	},
});
