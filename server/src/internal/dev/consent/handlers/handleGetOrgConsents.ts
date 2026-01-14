import { oauthConsent } from "@autumn/shared";
import { eq } from "drizzle-orm";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";

/**
 * Get OAuth consents for the current organization.
 * This is a custom endpoint that queries by referenceId (org ID),
 * unlike better-auth's built-in getConsents which only queries by userId.
 *
 * GET /consents
 * Auth: Session (from internalRouter middleware)
 *
 * Returns: Array of consents for the current org
 */
export const handleGetOrgConsents = createRoute({
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, org } = ctx;

		if (!org?.id) {
			return c.json({ error: "No organization found" }, 400);
		}

		// Query consents where referenceId matches the current org
		const consents = await db
			.select({
				id: oauthConsent.id,
				clientId: oauthConsent.clientId,
				userId: oauthConsent.userId,
				referenceId: oauthConsent.referenceId,
				scopes: oauthConsent.scopes,
				createdAt: oauthConsent.createdAt,
				updatedAt: oauthConsent.updatedAt,
			})
			.from(oauthConsent)
			.where(eq(oauthConsent.referenceId, org.id));

		return c.json({ consents });
	},
});
