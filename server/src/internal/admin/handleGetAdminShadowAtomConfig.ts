import { Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { shadowAtomConfigStore } from "@/internal/misc/shadowAtom/shadowAtomConfigStore.js";

export const handleGetAdminShadowAtomConfig = createRoute({
	scopes: [Scopes.Superuser],
	handler: async (c) => c.json(await shadowAtomConfigStore.readFromSource()),
});
