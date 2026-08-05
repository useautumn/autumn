import { Scopes } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import {
	getOrgRequestBlockFromSource,
	getRuntimeRequestBlockStatus,
} from "@/internal/misc/edgeConfigs/requestBlocks/requestBlockStore.js";

export const handleGetAdminOrgRequestBlock = createRoute({
	scopes: [Scopes.Superuser],
	params: z.object({
		org_id: z.string().min(1),
	}),
	handler: async (c) => {
		const { org_id: orgId } = c.req.valid("param");
		const status = getRuntimeRequestBlockStatus();
		const entry = await getOrgRequestBlockFromSource({ orgId });

		return c.json({
			blockAll: entry?.blockAll ?? false,
			blockedEndpoints: entry?.blockedEndpoints ?? [],
			updatedAt: entry?.updatedAt ?? null,
			updatedBy: entry?.updatedBy ?? null,
			configHealthy: status.healthy,
			configConfigured: status.configured,
			lastSuccessAt: status.lastSuccessAt ?? null,
			error: status.error ?? null,
		});
	},
});
