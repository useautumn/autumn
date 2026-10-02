import {
	type AlienClient,
	type AlienDeployment,
	type AlienFixedPools,
	deploymentToPoolMachine,
	deploymentToPublicEndpointUrl,
	hasDeploymentFailed,
	isDeploymentAwaitingSetup,
	isDeploymentRunning,
} from "@autumn/alien";
import { getAutumnEnv } from "@autumn/env";
import {
	type AppEnv,
	type ByocCacheMachine,
	ByocCacheStatus,
	findByocCacheMachineByInstanceType,
} from "@autumn/shared";
import {
	cacheExternalId,
	cacheGroupLabel,
	cacheNotRunning,
} from "../utils/byocCacheUtils.js";
import type {
	AtomAuth,
	AtomDeployer,
	AtomDeployment,
	AtomOwner,
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

const alienDeploymentToCacheStatus = ({
	deployment,
}: {
	deployment: AlienDeployment;
}): ByocCacheStatus => {
	if (isDeploymentAwaitingSetup({ deployment }))
		return ByocCacheStatus.AwaitingSetup;
	if (isDeploymentRunning({ deployment })) return ByocCacheStatus.Ready;
	if (hasDeploymentFailed({ deployment })) return ByocCacheStatus.Failed;
	return ByocCacheStatus.Provisioning;
};

const plainVariable = ({ name, value }: { name: string; value: string }) => ({
	name,
	value,
	type: "plain" as const,
	targetResources: null,
});

const atomAuthToVariables = ({ auth }: { auth: AtomAuth }) =>
	auth.mode === "deployed"
		? [plainVariable({ name: "ATOM_TOKEN_HASH", value: auth.tokenHash })]
		: [
				plainVariable({ name: "ATOM_MODE", value: "shared" }),
				plainVariable({
					name: "ATOM_ADMIN_TOKEN_HASH",
					value: auth.adminTokenHash,
				}),
			];

const startAlienAtom = ({
	ctx,
	org,
	env,
	auth,
	machine,
}: {
	ctx: AlienContext;
	org: AtomOwner;
	env: AppEnv;
	auth: AtomAuth;
	machine: ByocCacheMachine;
}): Promise<AtomSetup> =>
	ctx.alienClient.startSetup({
		externalId: cacheExternalId({ org, env }),
		label: cacheGroupLabel({ org, env }),
		pools: machineToAtomPools({ machine }),
		environmentVariables: [
			...atomAuthToVariables({ auth }),
			// A check Atom forwards must reach this environment's API, not the production default.
			plainVariable({
				name: "AUTUMN_API_URL",
				value: getAutumnEnv().AUTUMN_PUBLIC_API_URL,
			}),
		],
	});

const findAlienAtom = async ({
	ctx,
	deploymentGroupId,
}: {
	ctx: AlienContext;
	deploymentGroupId: string;
}): Promise<AtomDeployment | null> => {
	const deployment = await ctx.alienClient.findDeployment({
		deploymentGroupId,
	});
	if (!deployment) return null;
	return {
		id: deployment.id,
		status: alienDeploymentToCacheStatus({ deployment }),
		endpointUrl: deploymentToPublicEndpointUrl({
			deployment,
			resourceId: ATOM_RESOURCE_ID,
			endpointName: ATOM_ENDPOINT_NAME,
		}),
		machine: deploymentToAtomMachine({ deployment }),
	};
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
		delete: (params) => deleteAlienAtom({ ctx, ...params }),
	};
};
