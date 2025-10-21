import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { OrgService } from "../OrgService.js";

export const handleUpdateOrg = createRoute({
	body: z.object({
		onboarded: z.boolean().optional(),
		deployed: z.boolean().optional(),
	}),
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, org } = ctx;

		const { onboarded, deployed } = c.req.valid("json");

		await OrgService.update({
			db,
			orgId: org.id,
			updates: { onboarded, deployed },
		});

		return c.json({ success: true });
	},
});
