import {
	apiKeys,
	oauthAccessToken,
	oauthConsent,
	oauthRefreshToken,
} from "@autumn/shared";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { clearSecretKeyCache } from "../../api-keys/cacheApiKeyUtils.js";

/**
 * Revoke an OAuth consent and delete all linked resources:
 * - API keys (with meta.oauth_consent_id matching)
 * - Access tokens (matching clientId + referenceId)
 * - Refresh tokens (matching clientId + referenceId)
 * - The consent itself
 *
 * DELETE /consents/:consent_id
 * Auth: Session (from internalRouter middleware)
 *
 * Returns: { deleted_api_keys: ["am_sk_test_...", ...] }
 */
export const handleRevokeConsent = createRoute({
	params: z.object({
		consent_id: z.string(),
	}),
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, org } = ctx;
		const { consent_id } = c.req.valid("param");

		if (!org?.id) {
			throw new RecaseError({
				message: "No organization found",
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}

		// 1. Get the consent and verify it belongs to this org
		const consentRecords = await db
			.select({
				id: oauthConsent.id,
				clientId: oauthConsent.clientId,
				referenceId: oauthConsent.referenceId,
			})
			.from(oauthConsent)
			.where(eq(oauthConsent.id, consent_id))
			.limit(1);

		if (consentRecords.length === 0) {
			throw new RecaseError({
				message: "Consent not found",
				code: ErrCode.NotFound,
				statusCode: 404,
			});
		}

		const consent = consentRecords[0];

		if (consent.referenceId !== org.id) {
			throw new RecaseError({
				message: "Consent does not belong to this organization",
				code: ErrCode.Forbidden,
				statusCode: 403,
			});
		}
		}

		const { clientId, referenceId } = consent;

		// 2. Get API keys linked to this consent (for cache invalidation and response)
		const linkedKeys = await db
			.select({
				id: apiKeys.id,
				prefix: apiKeys.prefix,
				hashed_key: apiKeys.hashed_key,
			})
			.from(apiKeys)
			.where(sql`${apiKeys.meta}->>'oauth_consent_id' = ${consent_id}`);

		const deletedKeyPrefixes = linkedKeys.map((k) => k.prefix).filter(Boolean);

		// 3. Delete API keys and invalidate their cache
		for (const key of linkedKeys) {
			// Delete from database
			await db.delete(apiKeys).where(eq(apiKeys.id, key.id));

			// Invalidate cache
			if (key.hashed_key) {
				await clearSecretKeyCache({ hashedKey: key.hashed_key });
			}
		}

		// 4. Delete access tokens for this client + org
		await db
			.delete(oauthAccessToken)
			.where(
				and(
					eq(oauthAccessToken.clientId, clientId),
					eq(oauthAccessToken.referenceId, referenceId),
				),
			);

		// 5. Delete refresh tokens for this client + org
		await db
			.delete(oauthRefreshToken)
			.where(
				and(
					eq(oauthRefreshToken.clientId, clientId),
					eq(oauthRefreshToken.referenceId, referenceId),
				),
			);

		// 6. Delete the consent
		await db.delete(oauthConsent).where(eq(oauthConsent.id, consent_id));

		return c.json({
			success: true,
			deletedApiKeys: linkedKeys.length,
			deletedKeyPrefixes,
		});
	},
});
