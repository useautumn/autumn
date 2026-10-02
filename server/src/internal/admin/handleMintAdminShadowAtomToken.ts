import { Scopes } from "@autumn/shared";
import { withLock } from "@/external/redis/utils/lockUtils/withLock.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import {
	atomTokenToHash,
	generateAtomToken,
} from "@/internal/byoc/utils/atomTokenUtils.js";
import {
	SHADOW_ATOM_CONFIG_LOCK_KEY,
	shadowAtomConfigStore,
} from "@/internal/misc/shadowAtom/shadowAtomConfigStore.js";
import { encryptData } from "@/utils/encryptUtils.js";

/** Mints or rotates the shadow Atom's admin token; only the hash leaves, for the multi-tenant Atom's ATOM_TOKEN_HASH. */
export const handleMintAdminShadowAtomToken = createRoute({
	scopes: [Scopes.Superuser],
	handler: async (c) => {
		const token = generateAtomToken();
		await withLock({
			lockKey: SHADOW_ATOM_CONFIG_LOCK_KEY,
			fn: async () => {
				const config = await shadowAtomConfigStore.readFromSource();
				await shadowAtomConfigStore.writeToSource({
					config: { ...config, adminEncryptedToken: encryptData(token) },
				});
			},
		});
		return c.json({ admin_token_hash: atomTokenToHash({ token }) });
	},
});
