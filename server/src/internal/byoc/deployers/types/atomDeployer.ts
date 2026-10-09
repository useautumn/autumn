import type {
	ByocCacheMachine,
	ByocCacheNetwork,
	ByocCacheStage,
	ByocCacheStatus,
} from "@autumn/shared";

/** One env's Atom as whoever runs it reports it. */
export type AtomDeployment = {
	id: string;
	status: ByocCacheStatus;
	/** Null until the Atom is reachable. */
	endpointUrl: string | null;
	/** Null when it runs on a machine that is not one of `BYOC_CACHE_MACHINES`. */
	machine: ByocCacheMachine | null;
	/** Null until the org's setup has run in a region. */
	region: string | null;
	/** The deploy steps its runner reports done, `connected` included. */
	doneStages: ByocCacheStage[];
	/** While a delete runs, what it has taken down so far. */
	removedStages: ByocCacheStage[];
	/** Why the deploy or teardown stopped, in the runner's words. */
	error: string | null;
};

export type AtomSetup = {
	deploymentGroupId: string;
	/** The AWS console page that creates the org's stack; null when the Atom starts without the org running a setup. */
	setupUrl: string | null;
};

/** The Atom's one token: an org's own, or for our multi-tenant shadow Atom only, the admin token that registers orgs. */
export type AtomAuth = { mode: "deployed" | "multi_tenant"; tokenHash: string };

/** A deployment group's identity (`externalId`) and display name, which also names its stack. */
export type AtomNames = { externalId: string; label: string };

/** Whoever runs an org's Atom: alien in a real cloud, the dev stack's own Atom process locally. */
export type AtomDeployer = {
	/** The Atom is only ever given token hashes. Starting one that exists keeps its data. A null network takes the runner's default. */
	start(params: {
		names: AtomNames;
		auth: AtomAuth;
		machine: ByocCacheMachine;
		region: string;
		network?: ByocCacheNetwork | null;
	}): Promise<AtomSetup>;
	/** The deployment we know by id, followed through its delete; else the group's live one. Null once neither exists. */
	find(params: {
		deploymentGroupId: string;
		deploymentId?: string | null;
	}): Promise<AtomDeployment | null>;
	/** Moves a running Atom to another machine; its data stays. */
	resize(params: {
		deploymentGroupId: string;
		machine: ByocCacheMachine;
	}): Promise<void>;
	/** Resumes a failed deploy from the step that failed. */
	retry(params: { deploymentGroupId: string }): Promise<void>;
	/** Deleting one that is already gone is a no-op. */
	delete(params: { deploymentGroupId: string }): Promise<void>;
};
