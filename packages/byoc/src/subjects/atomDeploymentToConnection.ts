import type { AppEnv, AtomRoute } from "@autumn/shared";
import { isByocCacheReady } from "../cacheDeployments/classifyCacheDeployments.js";
import type {
	AtomConnection,
	AtomQueueAddress,
} from "./types/atomConnection.js";

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

export const atomDeploymentToConnection = ({
	atomDeployment,
	orgId,
	env,
	overQueue,
}: {
	atomDeployment: AtomRoute;
	orgId: string;
	env: AppEnv;
	overQueue: boolean;
}): AtomConnection | null => {
	if (!isByocCacheReady(atomDeployment)) return null;
	if (!atomDeployment.endpoint_url) return null;
	return {
		target: "org",
		endpointUrl: atomDeployment.endpoint_url,
		encryptedToken: atomDeployment.encrypted_token,
		queue:
			overQueue && atomDeployment.id
				? orgAtomQueueAddress({ orgId, env, atomId: atomDeployment.id })
				: null,
	};
};
