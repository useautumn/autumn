import {
	CreateSandboxParamsSchema,
	DEFAULT_SANDBOX_COLOR,
	DEFAULT_SANDBOX_ICON,
	Scopes,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import {
	assertNotSandboxContext,
	createSandboxForOrg,
} from "../createSandbox.js";
import { resolveSandboxActor } from "../resolveSandboxActor.js";

export const handleCreateSandbox = createRoute({
	scopes: [Scopes.Platform.Write],
	body: CreateSandboxParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, org: masterOrg, user, authType, scopes } = ctx;

		assertNotSandboxContext(masterOrg);
		const actorUser = await resolveSandboxActor({
			db,
			org: masterOrg,
			user,
			authType,
		});
		const { name, color, icon } = c.req.valid("json");

		const { org, secret_key } = await createSandboxForOrg({
			db,
			masterOrg,
			actorUser,
			name,
			color,
			icon,
			scopes,
		});

		return c.json({
			id: org.id,
			name: org.name,
			slug: org.slug,
			created_at: org.createdAt.getTime(),
			color: org.sandbox_color ?? DEFAULT_SANDBOX_COLOR,
			icon: org.sandbox_icon ?? DEFAULT_SANDBOX_ICON,
			secret_key,
		});
	},
});
