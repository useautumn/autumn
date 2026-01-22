import { AppEnv } from "@autumn/shared";
import { z } from "zod/v4";
import { captureOrgEvent } from "@/utils/posthog.js";
import { createRoute } from "../../../honoMiddlewares/routeHandler";
import { createKey } from "../api-keys/apiKeyUtils";

export const handleCreateSecretKey = createRoute({
	body: z.object({
		name: z.string().min(1),
	}),
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, env, org } = ctx;
		const { name } = c.req.valid("json");

		// 1. Create API key
		let prefix = "am_sk_test";
		if (env === AppEnv.Live) {
			prefix = "am_sk_live";
		}
		const apiKey = await createKey({
			db,
			env,
			name,
			orgId: org.id,
			userId: ctx.user?.id,
			prefix,
			meta: {},
		});

		await captureOrgEvent({
			orgId: org.id,
			event: "api key created",
			properties: {
				org_slug: org.slug,
				env,
			},
		});

		return c.json({
			api_key: apiKey,
		});
	},
});
