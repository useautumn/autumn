import { apiKeys, oauthConsent } from "@autumn/shared";
import { eq, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";

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

		// First verify the consent belongs to this org
		const consentRecords = await db
			.select({ id: oauthConsent.id, referenceId: oauthConsent.referenceId })
			.from(oauthConsent)
			.where(eq(oauthConsent.id, consent_id))
			.limit(1);

		if (consentRecords.length === 0) {
			return c.json({ error: "Consent not found" }, 404);
		}

		if (consentRecords[0].referenceId !== org.id) {
			return c.json({ error: "Consent does not belong to this organization" }, 403);
		}

		// Query API keys where meta->>'oauth_consent_id' = consent_id
		// Only return prefix, env, name - NOT the hashed key
		const keys = await db
			.select({
				id: apiKeys.id,
				prefix: apiKeys.prefix,
				env: apiKeys.env,
				name: apiKeys.name,
			})
			.from(apiKeys)
			.where(
				sql`${apiKeys.meta}->>'oauth_consent_id' = ${consent_id}`,
			);

		return c.json({ apiKeys: keys });
	},
});
