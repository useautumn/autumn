import { AppEnv, Scopes } from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import {
	atomTokenToHash,
	generateAtomToken,
} from "@/internal/byoc/utils/atomTokenUtils.js";
import { shadowAtomConfigStore } from "@/internal/misc/shadowAtom/shadowAtomConfigStore.js";
import { encryptData } from "@/utils/encryptUtils.js";

/** Mints or rotates an env's shadow Atom admin token; only the hash leaves, for the multi-tenant Atom's ATOM_ADMIN_TOKEN_HASH. */
export const handleMintAdminShadowAtomToken = createRoute({
	scopes: [Scopes.Superuser],
	body: z.object({ env: z.enum(AppEnv) }),
	handler: async (c) => {
		const { env } = c.req.valid("json");
		const token = generateAtomToken();
		const config = await shadowAtomConfigStore.readFromSource();
		config[env] = { ...config[env], adminEncryptedToken: encryptData(token) };
		await shadowAtomConfigStore.writeToSource({ config });
		return c.json({ env, admin_token_hash: atomTokenToHash({ token }) });
	},
});
