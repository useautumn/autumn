import {
	inAtomRollout,
	SHADOW_ATOM_EXTERNAL_ID,
	type ShadowAtomConfig,
	shadowAtomIdOf,
} from "@autumn/edge-config";
import type { AppEnv, Organization } from "@autumn/shared";
import { atomDeploymentToConnection } from "./atomDeploymentToConnection.js";
import type { AtomConnection } from "./types/atomConnection.js";

const shadowAtomConnection = ({
	shadowAtomConfig,
	org,
	env,
	customerId,
}: {
	shadowAtomConfig: ShadowAtomConfig;
	org: Organization;
	env: AppEnv;
	customerId: string | null;
}): AtomConnection | null => {
	const config = shadowAtomConfig;
	const registered = Object.hasOwn(config.orgs, org.id)
		? config.orgs[org.id]
		: null;
	if (!config.endpointUrl || !registered) return null;
	const holdsSubject =
		customerId === null || inAtomRollout({ config, orgId: org.id, customerId });
	if (!holdsSubject) return null;
	return {
		target: "shadow",
		endpointUrl: config.endpointUrl,
		encryptedToken: registered.encryptedTokens[env],
		queue:
			config.pushTransport === "queue"
				? {
						externalId: config.externalId ?? SHADOW_ATOM_EXTERNAL_ID,
						atomId: shadowAtomIdOf({ orgId: org.id, env }),
					}
				: null,
	};
};

export const orgToAtomTargets = ({
	shadowAtomConfig,
	org,
	env,
	customerId = null,
	orgAtomsOverQueue = false,
}: {
	shadowAtomConfig: ShadowAtomConfig;
	org: Organization;
	env: AppEnv;
	customerId?: string | null;
	orgAtomsOverQueue?: boolean;
}): AtomConnection[] =>
	[
		...(org.atomDeployments ?? []).map((atomDeployment) =>
			atomDeploymentToConnection({
				atomDeployment,
				orgId: org.id,
				env,
				overQueue: orgAtomsOverQueue,
			}),
		),
		shadowAtomConnection({ shadowAtomConfig, org, env, customerId }),
	].filter((connection) => connection !== null);
