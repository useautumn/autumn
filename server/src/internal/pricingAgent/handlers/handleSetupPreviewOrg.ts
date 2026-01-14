import {
	AppEnv,
	type Organization,
	RecaseError,
	user as userTable,
} from "@autumn/shared";
import { generateId } from "better-auth";
import { eq } from "drizzle-orm";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { createKey } from "@/internal/dev/api-keys/apiKeyUtils.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { afterOrgCreated } from "@/utils/authUtils/afterOrgCreated.js";

/**
 * Builds the deterministic preview org slug for a user
 */
export function buildPreviewOrgSlug({
	userId,
	masterOrgId,
}: {
	userId: string;
	masterOrgId: string;
}): string {
	return `preview|${userId}|${masterOrgId}`;
}

/**
 * Sets up a preview sandbox organization for the current user.
 * - Creates a new preview org if one doesn't exist
 * - Reuses existing preview org if found
 * - Returns a sandbox API key for making checkout calls
 */
export const handleSetupPreviewOrg = createRoute({
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
			// They can only interact with it via the returned API key.

			// Initialize org (creates Stripe test account, svix apps, etc.)
			await afterOrgCreated({ org: previewOrg, user });

			logger.info(
				`[Preview] Created preview org: ${previewOrg.id} (${previewSlug})`,
			);
		}

		// Generate a new sandbox API key for this session
		const apiKey = await createKey({
			db,
			orgId: previewOrg.id,
			env: AppEnv.Sandbox,
			name: "Preview API Key",
			prefix: "am_sk_test",
			meta: { preview: true },
		});

		return c.json({
			api_key: apiKey,
			org_slug: previewSlug,
			org_id: previewOrg.id,
		});
	},
});
