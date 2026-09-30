import { Scopes } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { resetRolloutOrgs } from "@/internal/misc/rollouts/rolloutConfigStore.js";

export const handleResetRolloutOrgs = createRoute({
	scopes: [Scopes.Superuser],
	params: z.object({
		rollout_id: z.string().min(1),
	}),
	handler: async (c) => {
		const { rollout_id: rolloutId } = c.req.param();

		const config = await resetRolloutOrgs({ rolloutId });

		return c.json({
			success: true,
			rolloutId,
			orgs: config.rollouts[rolloutId]?.orgs ?? {},
		});
	},
});
