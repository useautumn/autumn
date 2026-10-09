import {
	type AlienClient,
	type AlienDeployment,
	type AlienFixedPools,
	type AlienNetwork,
	deploymentToErrorMessage,
	deploymentToPoolMachine,
	deploymentToPublicEndpointUrl,
	hasDeploymentFailed,
	isDeploymentAwaitingSetup,
	isDeploymentAwaitingTeardown,
	isDeploymentDeleted,
	isDeploymentRemoving,
	isDeploymentRunning,
} from "@autumn/alien";
import { getAutumnEnv } from "@autumn/env";
import {
	type ByocCacheMachine,
	type ByocCacheNetwork,
	ByocCacheStatus,
	findByocCacheMachineByInstanceType,
} from "@autumn/shared";
import { cacheNotRunning } from "../utils/byocCacheUtils.js";
import { alienDeploymentToDoneStages } from "./alienDeploymentToDoneStages.js";
import type {
	AtomAuth,
	AtomDeployer,
	AtomDeployment,
	AtomNames,
	AtomSetup,
} from "./types/atomDeployer.js";

type AlienContext = { alienClient: AlienClient };

/** The container, its endpoint and its pool as `packages/alien/stacks/byoc/alien.json` names them. */
const ATOM_RESOURCE_ID = "atom";
const ATOM_ENDPOINT_NAME = "api";
const ATOM_POOL = "stateful";

/** One Atom is one stateful container, so its pool is one machine. */
const machineToAtomPools = ({
	machine,
}: {
	machine: ByocCacheMachine;
}): AlienFixedPools => ({
	[ATOM_POOL]: { machine: machine.instanceType, machines: 1 },
});

const deploymentToAtomMachine = ({
	deployment,
}: {
	deployment: AlienDeployment;
}): ByocCacheMachine | null => {
	const instanceType = deploymentToPoolMachine({ deployment, pool: ATOM_POOL });
	if (!instanceType) return null;
	return findByocCacheMachineByInstanceType({ instanceType }) ?? null;
};

/** Removal states come first: a deleted deployment's last steps also read as failed. */
const alienDeploymentToCacheStatus = ({
	deployment,
}: {
	deployment: AlienDeployment;
}): ByocCacheStatus => {
	if (isDeploymentAwaitingTeardown({ deployment }))
		return ByocCacheStatus.TeardownRequired;
	if (isDeploymentRemoving({ deployment })) return ByocCacheStatus.Removing;
	if (isDeploymentAwaitingSetup({ deployment }))
		return ByocCacheStatus.AwaitingSetup;
	if (isDeploymentRunning({ deployment })) return ByocCacheStatus.Ready;
	if (hasDeploymentFailed({ deployment })) return ByocCacheStatus.Failed;
	return ByocCacheStatus.Provisioning;
};

/** An existing VPC keeps Atom on its private subnets, so alien gets no public ones. */
const cacheNetworkToAlienNetwork = ({
	network,
}: {
	network: ByocCacheNetwork | null;
}): AlienNetwork | null => {
	if (!network) return null;
	if (network.type === "new_vpc") return { type: "create" };
	return {
		type: "byo-vpc-aws",
		vpc_id: network.vpc_id,
		private_subnet_ids: network.subnet_ids,
		public_subnet_ids: [],
	};
};

const plainVariable = ({ name, value }: { name: string; value: string }) => ({
	name,
	value,
	type: "plain" as const,
	targetResources: null,
});

/** A customer's Atom sets no ATOM_MODE; only our shadow Atom is multi-tenant. */
const atomAuthToVariables = ({ auth }: { auth: AtomAuth }) => [
	...(auth.mode === "multi_tenant"
		? [plainVariable({ name: "ATOM_MODE", value: "multi_tenant" })]
		: []),
	plainVariable({ name: "ATOM_TOKEN_HASH", value: auth.tokenHash }),
];

const startAlienAtom = ({
	ctx,
	names,
	auth,
	machine,
	region,
	network = null,
}: {
	ctx: AlienContext;
	names: AtomNames;
	auth: AtomAuth;
	machine: ByocCacheMachine;
	region: string;
	network?: ByocCacheNetwork | null;
}): Promise<AtomSetup> =>
	ctx.alienClient.startSetup({
		...names,
		region,
		pools: machineToAtomPools({ machine }),
		network: cacheNetworkToAlienNetwork({ network }),
		environmentVariables: [
			...atomAuthToVariables({ auth }),
			// A check Atom forwards must reach this environment's API, not the production default.
			plainVariable({
				name: "AUTUMN_API_URL",
				value: getAutumnEnv().AUTUMN_PUBLIC_API_URL,
			}),
		],
	});

/** The deployment we know by id until alien drops it; a deleted one gives way to whatever the group runs now. */
const findAlienDeployment = async ({
	ctx,
	deploymentGroupId,
	deploymentId,
}: {
	ctx: AlienContext;
	deploymentGroupId: string;
	deploymentId?: string | null;
}): Promise<AlienDeployment | null> => {
	const known = deploymentId
		? await ctx.alienClient.getDeployment({ deploymentId })
		: null;
	if (known && !isDeploymentDeleted({ deployment: known })) return known;
	return ctx.alienClient.findDeployment({ deploymentGroupId });
};

const alienDeploymentToAtom = ({
	deployment,
}: {
	deployment: AlienDeployment;
}): AtomDeployment => {
	const endpointUrl = deploymentToPublicEndpointUrl({
		deployment,
		resourceId: ATOM_RESOURCE_ID,
		endpointName: ATOM_ENDPOINT_NAME,
	});
	return {
		id: deployment.id,
		status: alienDeploymentToCacheStatus({ deployment }),
		endpointUrl,
		machine: deploymentToAtomMachine({ deployment }),
		region: deployment.region ?? null,
		doneStages: alienDeploymentToDoneStages({
			deployment,
			atomResourceId: ATOM_RESOURCE_ID,
			endpointUrl,
		}),
		error: deploymentToErrorMessage({ deployment }),
	};
};

const findAlienAtom = async ({
	ctx,
	deploymentGroupId,
	deploymentId,
}: {
	ctx: AlienContext;
	deploymentGroupId: string;
	deploymentId?: string | null;
}): Promise<AtomDeployment | null> => {
	const deployment = await findAlienDeployment({
		ctx,
		deploymentGroupId,
		deploymentId,
	});
	return deployment ? alienDeploymentToAtom({ deployment }) : null;
};

const resizeAlienAtom = async ({
	ctx,
	deploymentGroupId,
	machine,
}: {
	ctx: AlienContext;
	deploymentGroupId: string;
	machine: ByocCacheMachine;
}): Promise<void> => {
	const deployment = await ctx.alienClient.findDeployment({
		deploymentGroupId,
	});
	if (!deployment) throw cacheNotRunning();
	await ctx.alienClient.updateDeploymentCompute({
		deployment,
		pools: machineToAtomPools({ machine }),
	});
};

const retryAlienAtom = async ({
	ctx,
	deploymentGroupId,
}: {
	ctx: AlienContext;
	deploymentGroupId: string;
}): Promise<void> => {
	const deployment = await ctx.alienClient.findDeployment({
		deploymentGroupId,
	});
	if (deployment) await ctx.alienClient.retryDeployment({ deployment });
};

/** Tears down the deployment and the setup links that could start another. */
const deleteAlienAtom = async ({
	ctx,
	deploymentGroupId,
}: {
	ctx: AlienContext;
	deploymentGroupId: string;
}): Promise<void> => {
	const deployment = await ctx.alienClient.findDeployment({
		deploymentGroupId,
	});
	if (deployment) await ctx.alienClient.deleteDeployment({ deployment });
	await ctx.alienClient.revokeSetupLinks({ deploymentGroupId });
};

/** alien deploys the Atom image into the org's own cloud. */
export const createAlienAtomDeployer = ({
	alienClient,
}: {
	alienClient: AlienClient;
}): AtomDeployer => {
	const ctx = { alienClient };
	return {
		start: (params) => startAlienAtom({ ctx, ...params }),
		find: (params) => findAlienAtom({ ctx, ...params }),
		resize: (params) => resizeAlienAtom({ ctx, ...params }),
		retry: (params) => retryAlienAtom({ ctx, ...params }),
		delete: (params) => deleteAlienAtom({ ctx, ...params }),
	};
};
