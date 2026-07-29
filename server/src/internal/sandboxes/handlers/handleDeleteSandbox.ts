import { Scopes } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import {
	assertDashboardActor,
	assertNotSandboxContext,
} from "../createSandbox.js";
import { deleteSandboxForOrg } from "../deleteSandbox.js";

const DeleteSandboxSchema = z.object({
	id: z.string().min(1),
});

export const handleDeleteSandbox = createRoute({
	scopes: [Scopes.Platform.Write],
	body: DeleteSandboxSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, org: masterOrg, user, authType, logger } = ctx;

		assertNotSandboxContext(masterOrg);
		assertDashboardActor({ authType, user });

		const { id } = c.req.valid("json");

		await deleteSandboxForOrg({ db, masterOrg, sandboxId: id, logger });

		return c.json({ success: true });
	},
});
