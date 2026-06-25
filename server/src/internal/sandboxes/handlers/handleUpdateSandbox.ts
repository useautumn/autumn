import { SandboxColorSchema, SandboxIconSchema, Scopes } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import {
	assertDashboardActor,
	assertNotSandboxContext,
} from "../createSandbox.js";
import { updateSandboxForOrg } from "../updateSandbox.js";

const UpdateSandboxSchema = z
	.object({
		id: z.string().min(1),
		name: z.string().trim().min(1).max(100).optional(),
		color: SandboxColorSchema.optional(),
		icon: SandboxIconSchema.optional(),
	})
	.refine(
		(body) =>
			body.name !== undefined ||
			body.color !== undefined ||
			body.icon !== undefined,
		{ message: "Provide at least one of name, color, or icon" },
	);

export const handleUpdateSandbox = createRoute({
	scopes: [Scopes.Platform.Write],
	body: UpdateSandboxSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, org: masterOrg, user, authType } = ctx;

		assertNotSandboxContext(masterOrg);
		assertDashboardActor({ authType, user });

		const { id, name, color, icon } = c.req.valid("json");

		await updateSandboxForOrg({
			db,
			masterOrg,
			sandboxId: id,
			updates: { name, color, icon },
		});

		return c.json({ success: true });
	},
});
