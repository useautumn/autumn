import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { deleteRollout } from "@/internal/misc/rollouts/rolloutConfigStore.js";

export const handleDeleteRollout = createRoute({
	params: z.object({
		rollout_id: z.string().min(1),
	}),
	handler: async (c) => {
		const { rollout_id: rolloutId } = c.req.param();

		const config = await deleteRollout({ rolloutId });

		return c.json({ success: true, rolloutId, rollouts: config.rollouts });
	},
});
