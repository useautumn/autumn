import { RecaseError, Scopes } from "@autumn/shared";
import { z } from "zod/v4";
import { deletePlatformSubOrg } from "@/internal/orgs/deleteOrg/deletePlatformSubOrg.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { createRoute } from "../../../../honoMiddlewares/routeHandler.js";

const deleteOrgSchema = z.object({
	slug: z.string().min(1, "Organization slug is required"),
});

/** DELETE /organizations — deletes a platform sub-org by slug (test cleanup). */
export const handleDeletePlatformOrg = createRoute({
	scopes: [Scopes.Platform.Write],
	body: deleteOrgSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, logger, org: masterOrg } = ctx;

		const { slug } = c.req.valid("json");

		// Platform API uses `{slug}|{masterOrgId}` format.
		const fullSlug = `${slug}|${masterOrg.id}`;

		const org = await OrgService.getBySlug({ db, slug: fullSlug });
		if (!org) {
			throw new RecaseError({
				message: `Organization with slug "${slug}" not found`,
			});
		}

		await deletePlatformSubOrg({ db, org, logger });

		return c.json({
			success: true,
			message: `Organization "${slug}" deleted successfully`,
		});
	},
});
