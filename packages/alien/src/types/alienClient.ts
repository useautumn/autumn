export type AlienDeployment = {
	id: string;
	/** alien's lifecycle status, e.g. `provisioning`, `running`, `provisioning-failed`. */
	status: string;
	/** alien's resource outputs; read them with `deploymentToPublicEndpointUrl`. */
	stackState?: unknown;
};

/** A value the deployment's containers start with. */
export type AlienEnvironmentVariable = {
	name: string;
	value: string;
	type: "plain" | "secret";
};

export type AlienSetup = {
	deploymentGroupId: string;
	/** Null when the manager deploys without the customer's hand (local dev). */
	setupUrl: string | null;
};

/** The local `alien dev` manager, or alien's hosted platform for real customer clouds. */
export type AlienConfig =
	| { kind: "local"; baseUrl: string }
	| { kind: "hosted"; apiKey: string; project: string; workspace: string };

/** Everything Autumn asks of alien. A deployment group is one customer, keyed by our external id. */
export type AlienClient = {
	/** `label` is shown in alien's dashboard; it is reduced to a valid group name. */
	startSetup(params: {
		externalId: string;
		label: string;
		environmentVariables: AlienEnvironmentVariable[];
	}): Promise<AlienSetup>;
	findDeployment(params: {
		deploymentGroupId: string;
	}): Promise<AlienDeployment | null>;
	deleteDeployment(params: { deployment: AlienDeployment }): Promise<void>;
	revokeSetupLinks(params: { deploymentGroupId: string }): Promise<void>;
};
