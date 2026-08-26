import { ErrCode, RecaseError, Scopes } from "@autumn/shared";
import { z } from "zod/v4";
import { clearSecretKeyCache } from "@/external/redis/actions/secretKeyCache/secretKeyCache.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import {
	oauthAccessTokenRepo,
	oauthApiKeyRepo,
	oauthConsentRepo,
	oauthRefreshTokenRepo,
} from "@/internal/auth/repos/index.js";

/** Only the consent owner may revoke it and its linked credentials. */
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

		// Delete legacy main-org tokens and sandbox-bound consent tokens.
		await oauthAccessTokenRepo.deleteByClientAndReference({
			db,
			clientId,
			referenceId,
		});
		await oauthAccessTokenRepo.deleteByConsentId({ db, consentId: consent_id });

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
