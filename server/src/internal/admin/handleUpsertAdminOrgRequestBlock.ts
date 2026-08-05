import { Scopes } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { RequestBlockUpdateSchema } from "@/internal/misc/edgeConfigs/requestBlocks/requestBlockSchemas.js";
import { updateOrgRequestBlockInSource } from "@/internal/misc/edgeConfigs/requestBlocks/requestBlockStore.js";

export const handleUpsertAdminOrgRequestBlock = createRoute({
	scopes: [Scopes.Superuser],
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
