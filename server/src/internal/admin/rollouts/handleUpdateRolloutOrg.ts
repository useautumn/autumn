import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { updateRolloutPercent } from "@/internal/misc/rollouts/rolloutConfigStore.js";

export const handleUpdateRolloutOrg = createRoute({
	params: z.object({
		rollout_id: z.string().min(1),
		org_id: z.string().min(1),
	}),
	body: z.object({
		percent: z.number().min(0).max(100),
	}),
	handler: async (c) => {
		const { rollout_id: rolloutId, org_id: orgId } = c.req.param();
		const { percent } = c.req.valid("json");

		const config = await updateRolloutPercent({ rolloutId, orgId, percent });
		const orgEntry = config.rollouts[rolloutId]?.orgs[orgId];

		return c.json({
			success: true,
			rolloutId,
			orgId,
			percent: orgEntry?.percent ?? 0,
			previousPercent: orgEntry?.previousPercent ?? 0,
			changedAt: orgEntry?.changedAt ?? 0,
		});
	},
});
