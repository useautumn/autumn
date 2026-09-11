import { CreateSandboxKeyParamsSchema, Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { assertNotSandboxContext, createSandboxKey } from "../createSandbox.js";
import { getOwnedSandbox } from "../getOwnedSandbox.js";
import { resolveSandboxActor } from "../resolveSandboxActor.js";

/**
 * A fresh key for a sandbox this organization owns: what `atmn sandbox use`
 * calls when the machine has no key for the sandbox it is pointed at. The
 * key carries the caller's scopes, so it can never reach further than the
 * main key that minted it.
 */
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
