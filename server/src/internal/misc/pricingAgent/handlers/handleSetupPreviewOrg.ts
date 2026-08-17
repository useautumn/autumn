import {
	type Organization,
	RecaseError,
	Scopes,
	user as userTable,
} from "@autumn/shared";
import { generateId } from "better-auth";
import { eq } from "drizzle-orm";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { apiKeyRepo } from "@/internal/dev/repos/index.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { afterOrgCreated } from "@/utils/authUtils/afterOrgCreated.js";
import { buildPreviewOrgSlug } from "./previewOrgUtils.js";

/**
 * Sets up a preview sandbox organization for the current user.
 * - Creates a new preview org if one doesn't exist
 * - Reuses existing preview org if found
 *
 * No API key is ever returned to the client. Preview operations (syncing
 * pricing, creating a checkout) run server-side against this org, keyed off
 * the caller's session. Historically this route minted an unrestricted
 * sandbox secret key and returned it in the response body; those keys are
 * revoked here so any that leaked to a browser stop working.
 */
export const handleSetupPreviewOrg = createRoute({
	scopes: {
		ALL: [Scopes.Plans.Write, Scopes.Features.Write, Scopes.Customers.Write],
	},
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, org: masterOrg, logger, userId } = ctx;

		if (!userId) {
			throw new RecaseError({
				message: "User not authenticated",
				code: "unauthenticated",
				statusCode: 401,
			});
		}

		// Fetch user from database
		const user = await db.query.user.findFirst({
			where: eq(userTable.id, userId),
		});

		if (!user) throw new RecaseError({ message: "User not found" });

		const previewSlug = buildPreviewOrgSlug({
			userId,
			masterOrgId: masterOrg.id,
		});

		// Check if preview org already exists
		const existingOrg = await OrgService.getBySlug({ db, slug: previewSlug });

		let previewOrg: Organization;

		if (existingOrg) {
			previewOrg = existingOrg;
			logger.info(
				`[Preview] Found existing preview org: ${previewOrg.id} (${previewSlug})`,
			);

			// Revoke any keys previously handed out for this preview org. The org
			// is fully machine-managed and has no members, so every key on it was
			// minted by the old setup flow.
			const revoked = await apiKeyRepo.deleteByOrg({
				db,
				orgId: previewOrg.id,
			});

			if (revoked.length > 0) {
				logger.info(
					`[Preview] Revoked ${revoked.length} legacy preview API key(s) for org: ${previewOrg.id}`,
				);
			}
		} else {
			// Create new preview organization
			const orgId = generateId();

			logger.info(
				`[Preview] Creating new preview org: ${orgId} (${previewSlug})`,
			);

			previewOrg = await OrgService.create({
				db,
				id: orgId,
				slug: previewSlug,
				name: `Preview - ${user.name || user.email}`,
				createdBy: masterOrg.id,
			});

			// Note: We intentionally do NOT create a membership here.
			// The preview org should not be accessible to the user via the dashboard.
			// They can only interact with it via the /preview/* routes.

			// Initialize org (creates Stripe test account, svix apps, etc.)
			await afterOrgCreated({ org: previewOrg, user });

			logger.info(
				`[Preview] Created preview org: ${previewOrg.id} (${previewSlug})`,
			);
		}

		return c.json({
			org_slug: previewSlug,
			org_id: previewOrg.id,
		});
	},
});
