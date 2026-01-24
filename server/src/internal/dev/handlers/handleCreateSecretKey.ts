import { AppEnv } from "@autumn/shared";
import { z } from "zod/v4";
import { auth } from "@/utils/auth";
import { captureOrgEvent } from "@/utils/posthog.js";
import { createRoute } from "../../../honoMiddlewares/routeHandler";
import { ApiKeyPrefix, createKey } from "../api-keys/apiKeyUtils";
export const handleCreateSecretKey = createRoute({
	body: z.object({
		name: z.string().min(1),
	}),
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, env, org } = ctx;
		const { name } = c.req.valid("json");

		// 1. Create API key
		let prefix = ApiKeyPrefix.Sandbox;
		if (env === AppEnv.Live) {
			prefix = ApiKeyPrefix.Live;
		}

		// Get session to check for impersonation and author
		const session = await auth.api.getSession({
			headers: c.req.raw.headers,
		});

		const meta: Record<string, string> = {};

		// Check if this is an impersonation session (Autumn Support)
		if (session?.session?.impersonatedBy) {
			meta.created_via = "autumn_support";
		} else if (session?.user?.name) {
			// Regular user creation
			meta.author = session.user.name;
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
