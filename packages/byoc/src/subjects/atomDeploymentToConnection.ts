import type { AtomRoute } from "@autumn/shared";
import { isByocCacheReady } from "../cacheDeployments/classifyCacheDeployments.js";
import type { AtomConnection } from "./types/atomConnection.js";

/** How one of the org's own Atoms is reached; null unless it is ready and has an address. */
export const atomDeploymentToConnection = ({
	atomDeployment,
}: {
	atomDeployment: AtomRoute;
}): AtomConnection | null => {
	if (!isByocCacheReady(atomDeployment)) return null;
	if (!atomDeployment.endpoint_url) return null;
	return {
		target: "org",
		endpointUrl: atomDeployment.endpoint_url,
		encryptedToken: atomDeployment.encrypted_token,
		queue: null,
	};
};
