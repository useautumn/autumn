import { createRoute } from "../../../../honoMiddlewares/routeHandler.js";
import { OrgService } from "../../OrgService.js";

export const handleGetOrgMembers = createRoute({
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, org } = ctx;

		const memberships = await OrgService.getMembers({ db, orgId: org.id });
		const invites = await OrgService.getInvites({ db, orgId: org.id });

		return c.json({
			memberships,
			invites,
		});
	},
});
