import {
	ShadowAtomSettingsSchema,
	scheduleShadowAtomConfig,
} from "@autumn/edge-config";
import { Scopes } from "@autumn/shared";
import { withLock } from "@/external/redis/utils/lockUtils/withLock.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import {
	SHADOW_ATOM_CONFIG_LOCK_KEY,
	shadowAtomConfigStore,
} from "@/internal/misc/shadowAtom/shadowAtomConfigStore.js";
import { shadowAtomConfigToAdminView } from "./shadowAtom/shadowAtomConfigToAdminView.js";

/** Staff-only load-test dial: where each env's shadow Atom answers and which customers it holds. */
export const handleUpsertAdminShadowAtomConfig = createRoute({
	scopes: [Scopes.Superuser],
	body: ShadowAtomSettingsSchema,
	handler: async (c) => {
		const config = await withLock({
			lockKey: SHADOW_ATOM_CONFIG_LOCK_KEY,
			fn: async () => {
				const scheduled = scheduleShadowAtomConfig({
					current: await shadowAtomConfigStore.readFromSource(),
					next: c.req.valid("json"),
					now: Date.now(),
				});
				await shadowAtomConfigStore.writeToSource({ config: scheduled });
				return scheduled;
			},
		});
		return c.json(shadowAtomConfigToAdminView({ config }));
	},
});
