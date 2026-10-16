import type { AppEnv, AtomRoute } from "@autumn/shared";
import { isByocCacheReady } from "../cacheDeployments/classifyCacheDeployments.js";
import type {
	AtomConnection,
	AtomQueueAddress,
} from "./types/atomConnection.js";

/** The external id the server's `atomNames` starts an org's Atom under; a single-tenant Atom reads pushes with no folder. */
const orgAtomQueueAddress = ({
	orgId,
	env,
	atomId,
}: {
	orgId: string;
	env: AppEnv;
	atomId: string;
}): AtomQueueAddress => ({
	externalId: [orgId, env, atomId].join("."),
	atomId: null,
});

/** How one of the org's own Atoms is reached; null unless it is ready and has an address. */
export const atomDeploymentToConnection = ({
	atomDeployment,
	orgId,
	env,
	overQueue,
}: {
	atomDeployment: AtomRoute;
	orgId: string;
	env: AppEnv;
	/** Pushes go through the Atom's `pushes` queue; an org cached before routes carried the Atom's id has none. */
	overQueue: boolean;
}): AtomConnection | null => {
	if (!isByocCacheReady(atomDeployment)) return null;
	if (!atomDeployment.endpoint_url) return null;
	return {
		target: "org",
		id: atomDeployment.id ?? null,
		endpointUrl: atomDeployment.endpoint_url,
		encryptedToken: atomDeployment.encrypted_token,
		queue:
			overQueue && atomDeployment.id
				? orgAtomQueueAddress({ orgId, env, atomId: atomDeployment.id })
				: null,
	};
};
