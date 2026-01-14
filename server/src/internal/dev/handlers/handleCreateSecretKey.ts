import { AppEnv } from "@autumn/shared";
import { z } from "zod/v4";
import { auth } from "@/utils/auth";
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

		const meta: Record<string, string> = {};
		const user = await auth.api.getSession({
			headers: c.req.raw.headers,
		});

		if (user?.user?.name) {
			meta.author = user?.user?.name;
		}

		const apiKey = await createKey({
			db,
			env,
			name,
			orgId: org.id,
			userId: ctx.user?.id,
			prefix,
			meta,
		});

		return c.json({
			api_key: apiKey,
		});
	},
});
