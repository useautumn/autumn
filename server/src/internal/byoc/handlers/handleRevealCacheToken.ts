import { RevealByocCacheTokenParamsSchema, Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { revealCacheToken } from "../actions/revealCacheToken.js";

export const handleRevealCacheToken = createRoute({
	scopes: [Scopes.Organisation.Write],
	body: RevealByocCacheTokenParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		return c.json(await revealCacheToken({ ctx }));
	},
});
