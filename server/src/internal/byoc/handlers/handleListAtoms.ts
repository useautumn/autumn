import { ListByocAtomsParamsSchema, Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { listAtoms } from "../actions/lifecycle/listAtoms.js";

export const handleListAtoms = createRoute({
	scopes: [Scopes.Organisation.Read],
	body: ListByocAtomsParamsSchema,
	handler: async (c) => c.json(await listAtoms({ ctx: c.get("ctx") })),
});
