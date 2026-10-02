import { z } from "zod/v4";
import { Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { removeRolloutOrg } from "@/internal/misc/rollouts/rolloutConfigStore.js";

export const handleDeleteRolloutOrg = createRoute({
	scopes: [Scopes.Superuser],
	params: z.object({
		rollout_id: z.string().min(1),
		org_id: z.string().min(1),
	}),
	handler: async (c) => {
		const { rollout_id: rolloutId, org_id: orgId } = c.req.param();

		await removeRolloutOrg({ rolloutId, orgId });

		return c.json({ success: true, rolloutId, orgId });
	},
});
