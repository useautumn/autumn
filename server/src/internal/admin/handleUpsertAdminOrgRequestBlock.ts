import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { updateOrgRequestBlockInSource } from "@/internal/requestBlocks/requestBlockStore.js";
import { RequestBlockUpdateSchema } from "@/internal/requestBlocks/requestBlockSchemas.js";

export const handleUpsertAdminOrgRequestBlock = createRoute({
	params: z.object({
		org_id: z.string().min(1),
	}),
	body: RequestBlockUpdateSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { org_id: orgId } = c.req.valid("param");
		const body = c.req.valid("json");

		const entry = await updateOrgRequestBlockInSource({
			orgId,
			update: body,
			updatedBy: ctx.userId,
		});

		return c.json({
			success: true,
			blockAll: entry?.blockAll ?? false,
			blockedEndpoints: entry?.blockedEndpoints ?? [],
			updatedAt: entry?.updatedAt ?? null,
			updatedBy: entry?.updatedBy ?? null,
		});
	},
});
