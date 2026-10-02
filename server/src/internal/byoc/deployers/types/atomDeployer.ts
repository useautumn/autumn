import type { ByocCacheMachine, ByocCacheStatus } from "@autumn/shared";

/** One env's Atom as whoever runs it reports it. */
export type AtomDeployment = {
	id: string;
	status: ByocCacheStatus;
	/** Null until the Atom is reachable. */
	endpointUrl: string | null;
	/** Null when it runs on a machine that is not one of `BYOC_CACHE_MACHINES`. */
	machine: ByocCacheMachine | null;
};

export type AtomSetup = {
	deploymentGroupId: string;
	/** Null when the Atom starts without the org running a setup. */
	setupUrl: string | null;
};

/** The Atom's one token: an org's own, or for our multi-tenant shadow Atom only, the admin token that registers orgs. */
export type AtomAuth = { mode: "deployed" | "multi_tenant"; tokenHash: string };

/** A deployment group's identity (`externalId`) and display name, which also names its stack. */
export type AtomNames = { externalId: string; label: string };

/** Whoever runs an org's Atom: alien in a real cloud, the dev stack's own Atom process locally. */
export type AtomDeployer = {
	/** The Atom is only ever given token hashes. Starting one that exists keeps its data. */
	start(params: {
		names: AtomNames;
		auth: AtomAuth;
		machine: ByocCacheMachine;
	}): Promise<AtomSetup>;
	find(params: { deploymentGroupId: string }): Promise<AtomDeployment | null>;
	/** Moves a running Atom to another machine; its data stays. */
	resize(params: {
		deploymentGroupId: string;
		machine: ByocCacheMachine;
	}): Promise<void>;
	/** Deleting one that is already gone is a no-op. */
	delete(params: { deploymentGroupId: string }): Promise<void>;
};
