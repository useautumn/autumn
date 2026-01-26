import { AppEnv, oauthAccessToken, oauthConsent } from "@autumn/shared";
import { and, eq, gt } from "drizzle-orm";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { hashOAuthToken } from "@/utils/oauthUtils.js";
import { ApiKeyPrefix, createKey } from "../../api-keys/apiKeyUtils.js";

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
	handler: async (c) => {
		const db = c.get("ctx").db;

		// Get Bearer token from Authorization header
		const authHeader = c.req.header("Authorization");
		if (!authHeader?.startsWith("Bearer ")) {
		if (!authHeader?.startsWith("Bearer ")) {
			throw new RecaseError({
				message: "Missing or invalid Authorization header",
				code: ErrCode.Unauthorized,
				statusCode: 401,
			});
		}
		}

		const accessToken = authHeader.substring(7);

		// Better-auth stores opaque tokens as SHA-256 hashes in base64url format
		const hashedToken = await hashOAuthToken(accessToken);

		// Look up the token in the oauth_access_token table
		const tokenRecords = await db
			.select()
			.from(oauthAccessToken)
			.where(
				and(
					eq(oauthAccessToken.token, hashedToken),
					gt(oauthAccessToken.expiresAt, new Date()),
				),
			)
			.limit(1);

		if (tokenRecords.length === 0) {
			throw new RecaseError({
				message: "Invalid or expired access token",
				code: ErrCode.Unauthorized,
				statusCode: 401,
			});
		}

		const tokenRecord = tokenRecords[0];

		const userId = tokenRecord.userId;
		if (!userId) {
			throw new RecaseError({
				message: "Token missing user information",
				code: ErrCode.Unauthorized,
				statusCode: 401,
			});
		}

		// Get the org ID from the referenceId field (set by consentReferenceId)
		const orgId = tokenRecord.referenceId;
		if (!orgId) {
			throw new RecaseError({
				message: "No organization found. Please select an organization.",
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}
		}

		const clientId = tokenRecord.clientId;

		// Look up the OAuth consent to get its ID for linking API keys
		const consentRecords = await db
			.select({ id: oauthConsent.id })
			.from(oauthConsent)
			.where(
				and(
					eq(oauthConsent.clientId, clientId),
					eq(oauthConsent.userId, userId),
					eq(oauthConsent.referenceId, orgId),
				),
			)
			.limit(1);

		const consentId = consentRecords[0]?.id || null;

		// Build meta with consent linkage
		const meta = {
			oauth_consent_id: consentId,
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
			}),
			createKey({
				db,
				env: AppEnv.Live,
				name: `CLI Key - ${new Date().toISOString()}`,
				orgId,
				userId,
				prefix: ApiKeyPrefix.Live,
				meta,
			}),
		]);

		return c.json({
			sandbox_key: sandboxKey,
			prod_key: prodKey,
			org_id: orgId,
		});
	},
});
