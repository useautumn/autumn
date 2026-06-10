import { ErrCode, RecaseError, Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { oauthConsentRepo } from "@/internal/auth/repos/index.js";

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
	scopes: [Scopes.Organisation.Read],
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, env, org } = ctx;

		if (!org?.id) {
			throw new RecaseError({
				message: "No organization found",
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}

		const consents = await oauthConsentRepo.listByReferenceId({
			db,
			env,
			referenceId: org.id,
		});

		return c.json({ consents });
	},
});
