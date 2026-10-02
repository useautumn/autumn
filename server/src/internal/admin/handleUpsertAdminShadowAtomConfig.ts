import {
	applyShadowAtomSettings,
	ShadowAtomSettingsSchema,
} from "@autumn/edge-config";
import { Scopes } from "@autumn/shared";
import { withLock } from "@/external/redis/utils/lockUtils/withLock.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import {
	SHADOW_ATOM_CONFIG_LOCK_KEY,
	shadowAtomConfigStore,
} from "@/internal/misc/shadowAtom/shadowAtomConfigStore.js";
import { shadowAtomConfigToAdminView } from "./shadowAtom/shadowAtomConfigToAdminView.js";

/** Staff-only: where each env's shadow Atom answers. Orgs and their percents have their own routes. */
export const handleUpsertAdminShadowAtomConfig = createRoute({
	scopes: [Scopes.Superuser],
	body: ShadowAtomSettingsSchema,
	handler: async (c) => {
		const config = await withLock({
			lockKey: SHADOW_ATOM_CONFIG_LOCK_KEY,
			fn: async () => {
				const saved = applyShadowAtomSettings({
					current: await shadowAtomConfigStore.readFromSource(),
					next: c.req.valid("json"),
				});
				await shadowAtomConfigStore.writeToSource({ config: saved });
				return saved;
			},
		});
		return c.json(shadowAtomConfigToAdminView({ config }));
	},
});
