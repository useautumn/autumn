import { Scopes } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import {
	oauthApiKeyRepo,
	oauthConsentRepo,
} from "@/internal/auth/repos/index.js";

/**
 * Get API keys linked to a specific OAuth consent.
 * Used to preview which keys will be deleted when revoking consent.
 *
 * GET /consents/:consent_id/api-keys
 * Auth: Session (from internalRouter middleware)
 *
 * Returns: Array of { id, prefix, env, name }
 */
export const handleGetConsentApiKeys = createRoute({
	scopes: [Scopes.ApiKeys.Read],
	params: z.object({
		consent_id: z.string(),
	}),
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, org } = ctx;
		const { consent_id } = c.req.valid("param");

		if (!org?.id) {
			return c.json({ error: "No organization found" }, 400);
		}

		const consent = await oauthConsentRepo.getOwner({
			db,
			consentId: consent_id,
		});

		if (!consent) {
			return c.json({ error: "Consent not found" }, 404);
		}

		if (consent.referenceId !== org.id) {
			return c.json(
				{ error: "Consent does not belong to this organization" },
				403,
			);
		}

		const keys = (
			await oauthApiKeyRepo.listByConsentId({
				db,
				consentId: consent_id,
			})
		).map(({ hashed_key: _hashedKey, ...key }) => key);

		return c.json({ apiKeys: keys });
	},
});
