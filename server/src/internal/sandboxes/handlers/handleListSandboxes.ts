import {
	DEFAULT_SANDBOX_COLOR,
	DEFAULT_SANDBOX_ICON,
	ListSandboxesParamsSchema,
	Scopes,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { assertNotSandboxContext } from "../createSandbox.js";
import { resolveSandboxActor } from "../resolveSandboxActor.js";

export const handleListSandboxes = createRoute({
	scopes: [Scopes.Organisation.Read],
	body: ListSandboxesParamsSchema,
	handler: async (c) => {
		const { db, org, user, authType } = c.get("ctx");

		assertNotSandboxContext(org);
		await resolveSandboxActor({ db, org, user, authType });

		const sandboxes = await OrgService.listSandboxes({
			db,
			masterOrgId: org.id,
		});

		return c.json({
			list: sandboxes.map((sandbox) => ({
				id: sandbox.id,
				name: sandbox.name,
				slug: sandbox.slug,
				created_at: sandbox.createdAt.getTime(),
				color: sandbox.sandbox_color ?? DEFAULT_SANDBOX_COLOR,
				icon: sandbox.sandbox_icon ?? DEFAULT_SANDBOX_ICON,
			})),
		});
	},
});
