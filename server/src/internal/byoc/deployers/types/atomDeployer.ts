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

/** Who an Atom answers to: one org's token, or, for our shadow Atom only, an admin token that registers orgs. */
export type AtomAuth =
	| { mode: "deployed"; tokenHash: string }
	| { mode: "multi_tenant"; adminTokenHash: string };

/** What names an Atom's deployment group: an org, or a fixed admin id for our shadow Atom. */
export type AtomOwner = Pick<Organization, "id" | "slug">;

/** Whoever runs an org's Atom: alien in a real cloud, the dev stack's own Atom process locally. */
export type AtomDeployer = {
	/** The Atom is only ever given token hashes. Starting one that exists keeps its data. */
	start(params: {
		org: AtomOwner;
		env: AppEnv;
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
