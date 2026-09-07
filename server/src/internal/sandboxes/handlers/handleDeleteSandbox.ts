import { DeleteSandboxParamsSchema, Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { assertNotSandboxContext } from "../createSandbox.js";
import { deleteSandboxForOrg } from "../deleteSandbox.js";
import { resolveSandboxActor } from "../resolveSandboxActor.js";

export const handleDeleteSandbox = createRoute({
	scopes: [Scopes.Platform.Write],
	body: DeleteSandboxParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, org: masterOrg, user, authType, logger } = ctx;

		assertNotSandboxContext(masterOrg);
		await resolveSandboxActor({ db, org: masterOrg, user, authType });

		const { id } = c.req.valid("json");

		await deleteSandboxForOrg({ db, masterOrg, sandboxId: id, logger });

		return c.json({ success: true });
	},
});
