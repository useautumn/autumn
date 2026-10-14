export type AlienDeployment = {
	id: string;
	status: string;
	region?: string | null;
	lastHeartbeatAt?: string | null;
	error?: unknown;
	stackState?: unknown;
	stackSettings?: unknown;
};

export type AlienFixedPools = Record<
	string,
	{ machine: string; machines: number }
>;

export type AlienContainerResources = Record<
	string,
	{ cpu: number; memory: string }
>;

export type AlienNetwork =
	| { type: "create" }
	| {
			type: "byo-vpc-aws";
			vpc_id: string;
			public_subnet_ids: string[];
			private_subnet_ids: string[];
	  };

export type AlienResourceState = {
	id: string;
	type: string | null;
	status: string | null;
	outputs: Record<string, unknown> | null;
	error: string | null;
};

export type AlienEnvironmentVariable = {
	name: string;
	value: string;
	type: "plain" | "secret";
	targetResources: string[] | null;
};

export type AlienSetup = {
	deploymentGroupId: string;
	setupUrl: string | null;
};

export type AlienLogger = {
	warn(message: string, data: Record<string, unknown>): void;
};

export type AlienConfig =
	| { kind: "local"; baseUrl: string }
	| { kind: "hosted"; apiKey: string; project: string; workspace: string };

export type AlienClient = {
	startSetup(params: {
		externalId: string;
		label: string;
		region: string;
		environmentVariables: AlienEnvironmentVariable[];
		pools: AlienFixedPools;
		containers: AlienContainerResources;
		network: AlienNetwork | null;
	}): Promise<AlienSetup>;
	findDeploymentGroup(params: {
		externalId: string;
	}): Promise<{ id: string } | null>;
	findDeployment(params: {
		deploymentGroupId: string;
	}): Promise<AlienDeployment | null>;
	getDeployment(params: {
		deploymentId: string;
	}): Promise<AlienDeployment | null>;
	retryDeployment(params: { deployment: AlienDeployment }): Promise<void>;
	updateDeploymentCompute(params: {
		deployment: AlienDeployment;
		pools: AlienFixedPools;
	}): Promise<void>;
	deleteDeployment(params: { deployment: AlienDeployment }): Promise<void>;
	revokeSetupLinksOnceDeleted(params: {
		deploymentGroupId: string;
	}): Promise<void>;
};
