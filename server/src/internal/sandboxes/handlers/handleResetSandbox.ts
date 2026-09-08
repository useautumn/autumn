import { ResetSandboxParamsSchema, Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { resetSandbox } from "../resetSandbox.js";

export const handleResetSandbox = createRoute({
	scopes: {
		ALL: [
			Scopes.Organisation.Write,
			Scopes.Plans.Write,
			Scopes.Features.Write,
			Scopes.Customers.Write,
			Scopes.Migrations.Write,
		],
	},
	body: ResetSandboxParamsSchema,
	handler: async (c) => {
		await resetSandbox({ ctx: c.get("ctx") });

		return c.json({ success: true });
	},
});
