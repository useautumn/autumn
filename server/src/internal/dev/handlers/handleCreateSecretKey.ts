import { AppEnv, ErrCode, RecaseError } from "@autumn/shared";
import { z } from "zod/v4";
import { auth } from "@/utils/auth";
import { captureOrgEvent } from "@/utils/posthog.js";
import { createRoute } from "../../../honoMiddlewares/routeHandler";
import { ApiKeyPrefix, createKey } from "../api-keys/apiKeyUtils";

const MS_30_DAYS = 30 * 24 * 60 * 60 * 1000;

export const handleCreateSecretKey = createRoute({
	body: z.object({
		name: z.string().min(1),
		expires_at: z.number().nullable().optional(),
	}),
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, env, org } = ctx;
		const { name, expires_at } = c.req.valid("json");

		const session = await auth.api.getSession({
			headers: c.req.raw.headers,
		});

		const isImpersonated = !!session?.session?.impersonatedBy;
		const now = Date.now();
		const maxImpersonatedExpiry = now + MS_30_DAYS;

		if (expires_at !== undefined && expires_at !== null) {
			if (expires_at <= now) {
				throw new RecaseError({
					message: "expires_at must be in the future",
					code: ErrCode.InvalidInputs,
					statusCode: 400,
				});
			}
		}

		if (isImpersonated) {
			if (!expires_at) {
				throw new RecaseError({
					message: "expires_at is required for impersonated sessions",
					code: ErrCode.InvalidInputs,
					statusCode: 400,
				});
			}

			if (expires_at > maxImpersonatedExpiry) {
				throw new RecaseError({
					message: "expires_at cannot exceed 30 days for impersonated sessions",
					code: ErrCode.InvalidInputs,
					statusCode: 400,
				});
			}
		}

		let prefix = ApiKeyPrefix.Sandbox;
		if (env === AppEnv.Live) {
			prefix = ApiKeyPrefix.Live;
		}

		const meta: Record<string, string> = {};

		if (isImpersonated) {
			meta.created_via = "autumn_support";
		} else if (session?.user?.name) {
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
			expiresAt: expires_at ?? null,
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
