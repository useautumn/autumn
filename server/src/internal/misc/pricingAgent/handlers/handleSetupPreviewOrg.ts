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

		const user = await db.query.user.findFirst({
			where: eq(userTable.id, userId),
		});

		if (!user) throw new RecaseError({ message: "User not found" });

		const previewSlug = buildPreviewOrgSlug({
			userId,
			masterOrgId: masterOrg.id,
		});

		const existingOrg = await OrgService.getBySlug({ db, slug: previewSlug });

		let previewOrg: Organization;

		if (existingOrg) {
			previewOrg = existingOrg;
			logger.info(
				`[Preview] Found existing preview org: ${previewOrg.id} (${previewSlug})`,
			);

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
