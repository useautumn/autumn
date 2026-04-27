import { z } from "zod/v4";
import { Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { updateRolloutPercent } from "@/internal/misc/rollouts/rolloutConfigStore.js";

export const handleUpdateRollout = createRoute({
	scopes: [Scopes.Superuser],
	params: z.object({
		rollout_id: z.string().min(1),
	}),
	body: z.object({
		percent: z.number().min(0).max(100),
	}),
	handler: async (c) => {
		const { rollout_id: rolloutId } = c.req.param();
		const { percent } = c.req.valid("json");

		const config = await updateRolloutPercent({ rolloutId, percent });
		const entry = config.rollouts[rolloutId];

		return c.json({
			success: true,
			rolloutId,
			percent: entry?.percent ?? 0,
			previousPercent: entry?.previousPercent ?? 0,
			changedAt: entry?.changedAt ?? 0,
		});
	},
});
