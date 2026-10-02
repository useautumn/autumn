import { Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { shadowAtomConfigStore } from "@/internal/misc/shadowAtom/shadowAtomConfigStore.js";
import { shadowAtomConfigToAdminView } from "./shadowAtom/shadowAtomConfigToAdminView.js";

export const handleGetAdminShadowAtomConfig = createRoute({
	scopes: [Scopes.Superuser],
	handler: async (c) =>
		c.json(
			shadowAtomConfigToAdminView({
				config: await shadowAtomConfigStore.readFromSource(),
			}),
		),
});
