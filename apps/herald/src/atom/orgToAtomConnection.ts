import { isByocCacheReady, orgToCacheDeployment } from "@autumn/byoc";
import type { AppEnv, Organization } from "@autumn/shared";
import type { AtomConnection } from "./types/atomClient.js";

/** How the org's Atom in this env is reached; null unless that Atom is ready and has an address. */
export const orgToAtomConnection = ({
	org,
	env,
}: {
	org: Organization;
	env: AppEnv;
}): AtomConnection | null => {
	const cacheDeployment = orgToCacheDeployment({ org, env });
	if (!isByocCacheReady(cacheDeployment)) return null;
	if (!cacheDeployment.endpoint_url) return null;
	return {
		target: "org",
		endpointUrl: cacheDeployment.endpoint_url,
		encryptedToken: cacheDeployment.encrypted_token,
		queue: null,
	};
};
