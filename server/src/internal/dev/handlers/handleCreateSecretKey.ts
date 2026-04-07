import { AppEnv, ErrCode, RecaseError } from "@autumn/shared";
import { z } from "zod/v4";
import { auth } from "@/utils/auth";
import { captureOrgEvent } from "@/utils/posthog.js";
import { createRoute } from "../../../honoMiddlewares/routeHandler";
import { ApiKeyPrefix, createKey } from "../api-keys/apiKeyUtils";

const MAX_IMPERSONATION_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export const handleCreateSecretKey = createRoute({
	body: z.object({
		name: z.string().min(1),
		expires_at: z.number().optional(),
	}),
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, env, org } = ctx;
		const { name, expires_at } = c.req.valid("json");

		let prefix = ApiKeyPrefix.Sandbox;
		if (env === AppEnv.Live) {
			prefix = ApiKeyPrefix.Live;
		}

		const session = await auth.api.getSession({
			headers: c.req.raw.headers,
		});

		const meta: Record<string, string> = {};
		const isImpersonating = !!session?.session?.impersonatedBy;

		if (isImpersonating) {
			meta.created_via = "autumn_support";

			if (!expires_at) {
				throw new RecaseError({
					message:
						"API keys created during impersonation must have an expiry date",
					code: ErrCode.InvalidRequest,
					statusCode: 400,
				});
			}

			const maxAllowed = Date.now() + MAX_IMPERSONATION_EXPIRY_MS;
			if (expires_at > maxAllowed) {
				throw new RecaseError({
					message:
						"API keys created during impersonation cannot expire more than 30 days from now",
					code: ErrCode.InvalidRequest,
					statusCode: 400,
				});
			}
		} else if (session?.user?.name) {
			meta.author = session.user.name;
		}

		if (expires_at && expires_at <= Date.now()) {
			throw new RecaseError({
				message: "Expiry date must be in the future",
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
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
