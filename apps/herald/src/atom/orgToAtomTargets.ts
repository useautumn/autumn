import { inAtomRollout, type ShadowAtomConfig } from "@autumn/edge-config";
import type { AppEnv, Organization } from "@autumn/shared";
import { orgToAtomConnection } from "./orgToAtomConnection.js";
import type { AtomConnection } from "./types/atomClient.js";

/** Our shadow Atom for this env, or null unless it has an address, the org is registered on it and, for a subject, it holds the customer. */
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
	const config = shadowAtomConfig[env];
	const registered = config.orgs[org.id];
	if (!config.endpointUrl || !registered) return null;
	const holdsSubject =
		customerId === null || inAtomRollout({ config, orgId: org.id, customerId });
	if (!holdsSubject) return null;
	return {
		target: "shadow",
		endpointUrl: config.endpointUrl,
		encryptedToken: registered.encryptedToken,
	};
};

/**
 * Every Atom a push goes to: the org's own whenever it is ready, and our shadow Atom when it holds the customer.
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
		orgToAtomConnection({ org, env }),
		shadowAtomConnection({ shadowAtomConfig, org, env, customerId }),
	].filter((connection) => connection !== null);
