import {
	inAtomRollout,
	SHADOW_ATOM_EXTERNAL_ID,
	type ShadowAtomConfig,
	shadowAtomIdOf,
} from "@autumn/edge-config";
import type { AppEnv, Organization } from "@autumn/shared";
import { atomDeploymentToConnection } from "./atomDeploymentToConnection.js";
import type { AtomConnection } from "./types/atomClient.js";

/** Our shadow Atom's folder for this env, or null unless it has an address, the org is registered on it and, for a subject, it holds the customer. */
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
						externalId: SHADOW_ATOM_EXTERNAL_ID,
						atomId: shadowAtomIdOf({ orgId: org.id, env }),
					}
				: null,
	};
};

/**
 * Every Atom a push goes to: the org's own whenever they are ready, and our shadow Atom when it holds the customer.
 * A catalog push names no customer, so the shadow Atom takes every registered org's catalog.
 */
export const orgToAtomTargets = ({
	shadowAtomConfig,
	org,
	env,
	customerId = null,
}: {
	shadowAtomConfig: ShadowAtomConfig;
	org: Organization;
	env: AppEnv;
	customerId?: string | null;
}): AtomConnection[] =>
	[
		...(org.atomDeployments ?? []).map((atomDeployment) =>
			atomDeploymentToConnection({ atomDeployment }),
		),
		shadowAtomConnection({ shadowAtomConfig, org, env, customerId }),
	].filter((connection) => connection !== null);
