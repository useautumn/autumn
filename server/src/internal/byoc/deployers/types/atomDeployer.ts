import type {
	ByocCacheMachine,
	ByocCacheNetwork,
	ByocCacheStage,
	ByocCacheStatus,
} from "@autumn/shared";

export type AtomDeployment = {
	id: string;
	status: ByocCacheStatus;
	endpointUrl: string | null;
	machine: ByocCacheMachine | null;
	region: string | null;
	doneStages: ByocCacheStage[];
	removedStages: ByocCacheStage[];
	error: string | null;
};

export type AtomSetup = {
	deploymentGroupId: string;
	setupUrl: string | null;
};

export type AtomAuth = { mode: "deployed" | "multi_tenant"; tokenHash: string };

export type AtomNames = { externalId: string; label: string };

export type AtomDeployer = {
	start(params: {
		names: AtomNames;
		auth: AtomAuth;
		machine: ByocCacheMachine;
		region: string;
		network?: ByocCacheNetwork | null;
	}): Promise<AtomSetup>;
	hasGroup(params: { externalId: string }): Promise<boolean>;
	find(params: {
		deploymentGroupId: string;
		deploymentId?: string | null;
	}): Promise<AtomDeployment | null>;
	resize(params: {
		deploymentGroupId: string;
		machine: ByocCacheMachine;
	}): Promise<void>;
	retry(params: { deploymentGroupId: string }): Promise<void>;
	delete(params: { deploymentGroupId: string }): Promise<void>;
	closeSetup(params: { deploymentGroupId: string }): Promise<void>;
};
