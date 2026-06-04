import { AppEnv, ErrCode, RecaseError, Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import {
	getExternalOAuthApiKeyForToken,
	getOAuthAccessTokenRecord,
} from "@/internal/auth/oauth/oauthAccessTokenApiKey.js";
import { oauthConsentRepo } from "@/internal/auth/repos/index.js";
import { ApiKeyPrefix, createKey } from "../../api-keys/apiKeyUtils.js";
import {
	type OAuthApiKeyRequestBody,
	OAuthApiKeyRequestBodySchema,
	parseRequestedScopes,
} from "../oauthApiKeyUtils.js";

const parseBody = (rawBody: string): OAuthApiKeyRequestBody => {
	let body: unknown = {};
	if (rawBody) {
		try {
			body = JSON.parse(rawBody);
		} catch {
			throw new RecaseError({
				message: "Invalid request body",
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}
	}

	const parsed = OAuthApiKeyRequestBodySchema.safeParse(body);
	if (parsed.success) return parsed.data;

	throw new RecaseError({
		message: "Invalid request body",
		code: ErrCode.InvalidRequest,
		statusCode: 400,
	});
};

/**
 * Create API keys from an OAuth access token.
 * Called by the CLI after completing the OAuth flow.
 *
 * POST /cli/api-keys
 * Authorization: Bearer <oauth_access_token>
 *
 * Returns: { sandbox_key, prod_key, org_id }
 */
export const handleCreateOAuthApiKeys = createRoute({
	scopes: [Scopes.Public],
	handler: async (c) => {
		const db = c.get("ctx").db;
		const rawBody = await c.req.text();
		const body = parseBody(rawBody);
		const requestedScopes = parseRequestedScopes(body.scopes);
		const resource = typeof body.resource === "string" ? body.resource : null;

		// Get Bearer token from Authorization header
		const authHeader = c.req.header("Authorization");
		if (!authHeader?.startsWith("Bearer ")) {
			throw new RecaseError({
				message: "Missing or invalid Authorization header",
				code: ErrCode.InvalidRequest,
				statusCode: 401,
			});
		}

		const accessToken = authHeader.substring(7);

		const tokenRecord = await getOAuthAccessTokenRecord({
			db,
			accessToken,
			resource,
			requestedScopes,
		});
		const userId = tokenRecord.userId;
		const orgId = tokenRecord.referenceId;
		const clientId = tokenRecord.clientId;

		const externalApiKey = await getExternalOAuthApiKeyForToken({
			db,
			tokenRecord,
			requestedScopes,
		});
		if (externalApiKey) {
			return c.json({
				sandbox_key:
					externalApiKey.env === AppEnv.Sandbox
						? externalApiKey.apiKey
						: undefined,
				prod_key:
					externalApiKey.env === AppEnv.Live
						? externalApiKey.apiKey
						: undefined,
				org_id: orgId,
				user_id: userId,
				client_id: clientId,
				scopes: externalApiKey.scopes,
			});
		}

		const consent = await oauthConsentRepo.getForClientUserOrg({
			db,
			clientId,
			userId,
			referenceId: orgId,
		});

		const meta = {
			oauth_consent_id: consent?.id ?? null,
			oauth_client_id: clientId,
			oauth_redirect_uri: consent?.redirectUri ?? null,
			created_via: "oauth",
			generatedAt: new Date().toISOString(),
		};

		// Create API keys for both sandbox and production
		const [sandboxKey, prodKey] = await Promise.all([
			createKey({
				db,
				env: AppEnv.Sandbox,
				name: `CLI Key - ${new Date().toISOString()}`,
				orgId,
				userId,
				prefix: ApiKeyPrefix.Sandbox,
				meta,
				scopes: requestedScopes,
			}),
			createKey({
				db,
				env: AppEnv.Live,
				name: `CLI Key - ${new Date().toISOString()}`,
				orgId,
				userId,
				prefix: ApiKeyPrefix.Live,
				meta,
				scopes: requestedScopes,
			}),
		]);

		return c.json({
			sandbox_key: sandboxKey,
			prod_key: prodKey,
			org_id: orgId,
			user_id: userId,
			client_id: clientId,
			scopes: requestedScopes,
		});
	},
});
