import { ListAtomChecksParamsSchema, Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { listAtomChecks } from "../actions/listAtomChecks.js";

export const handleListAtomChecks = createRoute({
	scopes: [Scopes.Organisation.Read],
	body: ListAtomChecksParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		return c.json(await listAtomChecks({ ctx }));
	},
});
