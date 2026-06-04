import { ErrCode, RecaseError, Scopes } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import {
	oauthAccessTokenRepo,
	oauthApiKeyRepo,
	oauthConsentRepo,
	oauthRefreshTokenRepo,
} from "@/internal/auth/repos/index.js";
import { clearSecretKeyCache } from "../../../dev/api-keys/cacheApiKeyUtils.js";

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
	scopes: [Scopes.Organisation.Write],
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

		const consent = await oauthConsentRepo.getOwner({
			db,
			consentId: consent_id,
		});
		if (!consent) {
			throw new RecaseError({
				message: "Consent not found",
				code: "not_found",
				statusCode: 404,
			});
		}

		if (consent.referenceId !== org.id) {
			throw new RecaseError({
				message: "Consent does not belong to this organization",
				code: "forbidden",
				statusCode: 403,
			});
		}

		const { clientId, referenceId } = consent;

		const linkedKeys = await oauthApiKeyRepo.listByConsentId({
			db,
			consentId: consent_id,
		});

		const deletedKeyPrefixes = linkedKeys.map((k) => k.prefix).filter(Boolean);

		// 3. Delete API keys and invalidate their cache
		for (const key of linkedKeys) {
			await oauthApiKeyRepo.deleteById({ db, apiKeyId: key.id });

			if (key.hashed_key) {
				await clearSecretKeyCache({ hashedKey: key.hashed_key });
			}
		}

		// 4. Delete access tokens for this client + org
		await oauthAccessTokenRepo.deleteByClientAndReference({
			db,
			clientId,
			referenceId,
		});

		// 5. Delete refresh tokens for this client + org
		await oauthRefreshTokenRepo.deleteByClientAndReference({
			db,
			clientId,
			referenceId,
		});

		// 6. Delete the consent
		await oauthConsentRepo.deleteById({ db, consentId: consent_id });

		return c.json({
			success: true,
			deletedApiKeys: linkedKeys.length,
			deletedKeyPrefixes,
		});
	},
});
