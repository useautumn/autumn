import { CreateSandboxKeyParamsSchema, Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { assertNotSandboxContext, createSandboxKey } from "../createSandbox.js";
import { getOwnedSandbox } from "../getOwnedSandbox.js";
import { resolveSandboxActor } from "../resolveSandboxActor.js";

export const handleCreateSandboxKey = createRoute({
	scopes: [Scopes.Platform.Write, Scopes.ApiKeys.Write],
	body: CreateSandboxKeyParamsSchema,
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
		const { id } = c.req.valid("json");
		const sandbox = await getOwnedSandbox({ db, masterOrg, sandboxId: id });

		const secret_key = await createSandboxKey({
			db,
			sandbox,
			actorUser,
			scopes,
		});

		return c.json({
			id: sandbox.id,
			name: sandbox.name,
			slug: sandbox.slug,
			secret_key,
		});
	},
});
