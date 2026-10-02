import {
	ShadowAtomConfigSchema,
	scheduleShadowAtomConfig,
} from "@autumn/edge-config";
import { Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { shadowAtomConfigStore } from "@/internal/misc/shadowAtom/shadowAtomConfigStore.js";

/** Staff-only load-test dial: where each env's shadow Atom answers and which customers it holds. */
export const handleUpsertAdminShadowAtomConfig = createRoute({
	scopes: [Scopes.Superuser],
	body: ShadowAtomConfigSchema,
	handler: async (c) => {
		const config = scheduleShadowAtomConfig({
			current: await shadowAtomConfigStore.readFromSource(),
			next: c.req.valid("json"),
			now: Date.now(),
		});
		await shadowAtomConfigStore.writeToSource({ config });
		return c.json(config);
	},
});
