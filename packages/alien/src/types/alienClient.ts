export type AlienDeployment = {
	id: string;
	/** alien's lifecycle status, e.g. `provisioning`, `running`, `provisioning-failed`. */
	status: string;
	/** The cloud region the customer's setup ran in; absent until it has. */
	region?: string | null;
	/** When the deployment's agent last reported in; absent until it first has. */
	lastHeartbeatAt?: string | null;
	/** Why the last operation stopped; read it with `deploymentToErrorMessage`. */
	error?: unknown;
	/** alien's resource outputs; read them with `deploymentToPublicEndpointUrl`. */
	stackState?: unknown;
	/** The settings the deployment runs with; read its machines with `deploymentToPoolMachine`. */
	stackSettings?: unknown;
};

/** Fixed-size compute pools by name: each runs `machines` of one EC2 `machine` type. */
export type AlienFixedPools = Record<
	string,
	{ machine: string; machines: number }
>;

/** Where a setup puts the deployment's network: alien's `stackSettings.defaults.network`. */
export type AlienNetwork =
	| { type: "create" }
	| {
			type: "byo-vpc-aws";
			vpc_id: string;
			public_subnet_ids: string[];
			private_subnet_ids: string[];
	  };

/** One resource of a deployment's stack, as alien last reported it. */
export type AlienResourceState = {
	id: string;
	/** alien's resource type, e.g. `container` or `compute-cluster`. */
	type: string | null;
	/** alien's resource status, e.g. `provisioning`, `running`, `provision-failed`. */
	status: string | null;
	outputs: Record<string, unknown> | null;
	error: string | null;
};

/** A value the deployment's containers start with. */
export type AlienEnvironmentVariable = {
	name: string;
	value: string;
	type: "plain" | "secret";
	/** Resource id patterns the variable reaches; null means every resource. */
	targetResources: string[] | null;
};

export type AlienSetup = {
	deploymentGroupId: string;
	/** The AWS console's quick-create page for the stack; null when the manager deploys without the customer's hand (local dev). */
	setupUrl: string | null;
};

/** The local `alien dev` manager, or alien's hosted platform for real customer clouds. */
export type AlienConfig =
	| { kind: "local"; baseUrl: string }
	| { kind: "hosted"; apiKey: string; project: string; workspace: string };

/** Everything Autumn asks of alien. A deployment group is one customer, keyed by our external id. */
export type AlienClient = {
	/** `label` is shown in alien's dashboard; it is reduced to a valid group name, which also names the stack. `pools` and `network` are the setup's defaults. */
	startSetup(params: {
		externalId: string;
		label: string;
		/** The AWS region the stack's console link opens in. */
		region: string;
		environmentVariables: AlienEnvironmentVariable[];
		pools: AlienFixedPools;
		network: AlienNetwork | null;
	}): Promise<AlienSetup>;
	findDeployment(params: {
		deploymentGroupId: string;
	}): Promise<AlienDeployment | null>;
	/** The deployment itself, in whatever state it is in, deletes included; null once alien no longer has it. */
	getDeployment(params: {
		deploymentId: string;
	}): Promise<AlienDeployment | null>;
	/** Resumes a failed deployment from where it stopped. */
	retryDeployment(params: { deployment: AlienDeployment }): Promise<void>;
	/** alien replaces a pool's machines; a pool's volumes follow its containers. */
	updateDeploymentCompute(params: {
		deployment: AlienDeployment;
		pools: AlienFixedPools;
	}): Promise<void>;
	deleteDeployment(params: { deployment: AlienDeployment }): Promise<void>;
	revokeSetupLinks(params: { deploymentGroupId: string }): Promise<void>;
};
