import { Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { assertNotSandboxContext } from "../createSandbox.js";

export const handleListSandboxes = createRoute({
	scopes: [Scopes.Platform.Read],
	handler: async (c) => {
		const { db, org } = c.get("ctx");

		assertNotSandboxContext(org);

		const sandboxes = await OrgService.listSandboxes({
			db,
			masterOrgId: org.id,
		});

		return c.json({
			list: sandboxes.map((sandbox) => ({
				id: sandbox.id,
				name: sandbox.name,
				slug: sandbox.slug,
				created_at: sandbox.createdAt,
			})),
		});
	},
});
