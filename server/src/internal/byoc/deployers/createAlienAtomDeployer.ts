import {
	type AlienClient,
	type AlienContainerResources,
	type AlienDeployment,
	type AlienFixedPools,
	type AlienNetwork,
	type AlienUpdateOperation,
	deploymentToErrorMessage,
	deploymentToPoolMachine,
	deploymentToPublicEndpointUrl,
	deploymentToUpdate,
	deploymentToVolumeSizeGib,
	hasDeploymentFailed,
	isDeploymentAwaitingTeardown,
	isDeploymentDeleted,
	isDeploymentRemoving,
	isDeploymentRunning,
} from "@autumn/alien";
import { getAutumnEnv } from "@autumn/env";
import {
	type ApiAtomUpdate,
	BYOC_CACHE_REPLICAS,
	type ByocCacheMachine,
	type ByocCacheNetwork,
	ByocCacheStatus,
	findByocCacheMachineByInstanceType,
} from "@autumn/shared";
import {
	cacheNotRunning,
	cacheStorageCannotShrink,
} from "../utils/byocCacheUtils.js";
import {
	alienDeploymentToDoneStages,
	alienDeploymentToRemovedStages,
} from "./alienDeploymentToDoneStages.js";
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

/** Each Atom replica fills its own machine. */
const machineToAtomPools = ({
	machine,
}: {
	machine: ByocCacheMachine;
}): AlienFixedPools => ({
	[ATOM_POOL]: { machine: machine.instanceType, machines: BYOC_CACHE_REPLICAS },
});

/** The Atom container's share of its machine, and each replica's volume; the release's resource ranges must hold every size's. */
const machineToAtomContainers = ({
	machine,
	volumeSizeGib,
}: {
	machine: ByocCacheMachine;
	volumeSizeGib: number;
}): AlienContainerResources => ({
	[ATOM_RESOURCE_ID]: {
		cpu: machine.container.cpu,
		memory: `${machine.container.memory}Gi`,
		volumeSizeGib,
	},
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
	volumeSizeGib,
	region,
	network = null,
}: {
	ctx: AlienContext;
	names: AtomNames;
	auth: AtomAuth;
	machine: ByocCacheMachine;
	volumeSizeGib: number;
	region: string;
	network?: ByocCacheNetwork | null;
}): Promise<AtomSetup> =>
	ctx.alienClient.startSetup({
		...names,
		region,
		pools: machineToAtomPools({ machine }),
		containers: machineToAtomContainers({ machine, volumeSizeGib }),
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

const UPDATE_STATUSES: Record<
	AlienUpdateOperation["status"],
	ApiAtomUpdate["status"]
> = {
	blocked: "requested",
	queued: "requested",
	applying: "applying",
	succeeded: "succeeded",
	superseded: "succeeded",
	failed: "failed",
};

/** A release or redeploy never changes compute, so only a configuration update can be a storage grow. */
const isConfigurationUpdate = (update: AlienUpdateOperation) =>
	(update.reasons ?? []).every((reason) => reason === "configuration");

/** alien's current configuration update in the API's words; a failure carries alien's reason. */
const alienDeploymentToUpdate = ({
	deployment,
}: {
	deployment: AlienDeployment;
}): ApiAtomUpdate | null => {
	const update = deploymentToUpdate({ deployment });
	if (!update || !isConfigurationUpdate(update)) return null;
	const status = UPDATE_STATUSES[update.status];
	return {
		status,
		requested_at: Date.parse(update.requestedAt),
		completed_at: update.completedAt ? Date.parse(update.completedAt) : null,
		error:
			status === "failed"
				? (update.actionRequired ?? deploymentToErrorMessage({ deployment }))
				: null,
	};
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
		removedStages: alienDeploymentToRemovedStages({
			deployment,
			atomResourceId: ATOM_RESOURCE_ID,
			endpointUrl,
		}),
		error: deploymentToErrorMessage({ deployment }),
		update: alienDeploymentToUpdate({ deployment }),
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

/** alien fills unsent container fields with release defaults, so the grow resends the Atom's whole compute. */
const growAlienAtomVolume = async ({
	ctx,
	deploymentGroupId,
	machine,
	volumeSizeGib,
}: {
	ctx: AlienContext;
	deploymentGroupId: string;
	machine: ByocCacheMachine;
	volumeSizeGib: number;
}): Promise<void> => {
	const deployment = await ctx.alienClient.findDeployment({
		deploymentGroupId,
	});
	if (!deployment) throw cacheNotRunning();
	const selectedGib = deploymentToVolumeSizeGib({
		deployment,
		resourceId: ATOM_RESOURCE_ID,
	});
	if (selectedGib !== null && volumeSizeGib < selectedGib)
		throw cacheStorageCannotShrink({
			currentGib: selectedGib,
			requestedGib: volumeSizeGib,
		});
	await ctx.alienClient.updateDeploymentCompute({
		deployment,
		pools: machineToAtomPools({ machine }),
		containers: machineToAtomContainers({ machine, volumeSizeGib }),
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

/** Tears down the deployment; its setup links stay, because deleting the customer's stack calls alien with them. */
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
		hasGroup: async (params) =>
			(await ctx.alienClient.findDeploymentGroup(params)) !== null,
		find: (params) => findAlienAtom({ ctx, ...params }),
		resize: (params) => resizeAlienAtom({ ctx, ...params }),
		growVolume: (params) => growAlienAtomVolume({ ctx, ...params }),
		retry: (params) => retryAlienAtom({ ctx, ...params }),
		delete: (params) => deleteAlienAtom({ ctx, ...params }),
		closeSetup: (params) => ctx.alienClient.revokeSetupLinksOnceDeleted(params),
	};
};
