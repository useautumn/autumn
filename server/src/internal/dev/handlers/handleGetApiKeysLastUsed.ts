import { Scopes } from "@autumn/shared";
import { createRoute } from "../../../honoMiddlewares/routeHandler";
import { getApiKeysLastUsed } from "../apiKeys/actions/getApiKeysLastUsed.js";

export const handleGetApiKeysLastUsed = createRoute({
	scopes: [Scopes.Organisation.Read],
	handler: async (c) => {
		const { available, lastUsed } = await getApiKeysLastUsed({
			ctx: c.get("ctx"),
		});
		return c.json({ available, last_used: lastUsed });
	},
});
