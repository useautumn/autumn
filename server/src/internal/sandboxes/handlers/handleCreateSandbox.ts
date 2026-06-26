import {
	DEFAULT_SANDBOX_COLOR,
	DEFAULT_SANDBOX_ICON,
	SandboxColorSchema,
	SandboxIconSchema,
	Scopes,
} from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import {
	assertDashboardActor,
	assertNotSandboxContext,
	createSandboxForOrg,
} from "../createSandbox.js";

const CreateSandboxSchema = z.object({
	name: z.string().trim().min(1).max(100),
	color: SandboxColorSchema.optional(),
	icon: SandboxIconSchema.optional(),
});

export const handleCreateSandbox = createRoute({
	scopes: [Scopes.Platform.Write],
	body: CreateSandboxSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, org: masterOrg, user, authType } = ctx;

		assertNotSandboxContext(masterOrg);
		const actorUser = assertDashboardActor({ authType, user });
		const { name, color, icon } = c.req.valid("json");

		const { org, secret_key } = await createSandboxForOrg({
			db,
			masterOrg,
			actorUser,
			name,
			color,
			icon,
		});

		return c.json({
			id: org.id,
			name: org.name,
			slug: org.slug,
			color: org.sandbox_color ?? DEFAULT_SANDBOX_COLOR,
			icon: org.sandbox_icon ?? DEFAULT_SANDBOX_ICON,
			secret_key,
		});
	},
});
