import type {
	AppEnv,
	ByocCacheMachine,
	ByocCacheStatus,
	Organization,
} from "@autumn/shared";

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

/** Whoever runs an org's Atom: alien in a real cloud, the dev stack's own Atom process locally. */
export type AtomDeployer = {
	/** The Atom is only ever given its token's hash. Starting one that exists keeps its data. */
	start(params: {
		org: Organization;
		env: AppEnv;
		tokenHash: string;
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
