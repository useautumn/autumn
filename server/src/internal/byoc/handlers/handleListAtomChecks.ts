import { ListAtomChecksParamsSchema, Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { listAtomChecks } from "../actions/telemetry/listAtomChecks.js";

export const handleListAtomChecks = createRoute({
	scopes: [Scopes.Organisation.Read],
	body: ListAtomChecksParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { atom_id } = c.req.valid("json");
		return c.json(await listAtomChecks({ ctx, atomId: atom_id }));
	},
});
