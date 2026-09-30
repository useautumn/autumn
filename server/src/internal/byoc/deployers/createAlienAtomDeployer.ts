import {
	type AlienClient,
	type AlienDeployment,
	deploymentToPublicEndpointUrl,
	hasDeploymentFailed,
	isDeploymentAwaitingSetup,
	isDeploymentRunning,
} from "@autumn/alien";
import {
	type AppEnv,
	ByocCacheStatus,
	type Organization,
} from "@autumn/shared";
import { cacheExternalId, cacheGroupLabel } from "../utils/byocCacheUtils.js";
import type {
	AtomDeployer,
	AtomDeployment,
	AtomSetup,
} from "./types/atomDeployer.js";

type AlienContext = { alienClient: AlienClient };

/** The container and its endpoint as `packages/alien/stacks/byoc/alien.json` names them. */
const ATOM_RESOURCE_ID = "atom";
const ATOM_ENDPOINT_NAME = "api";

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

const startAlienAtom = ({
	ctx,
	org,
	env,
	tokenHash,
}: {
	ctx: AlienContext;
	org: Organization;
	env: AppEnv;
	tokenHash: string;
}): Promise<AtomSetup> =>
	ctx.alienClient.startSetup({
		externalId: cacheExternalId({ org, env }),
		label: cacheGroupLabel({ org, env }),
		environmentVariables: [
			{ name: "ATOM_TOKEN_HASH", value: tokenHash, type: "plain" },
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
	};
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
		delete: (params) => deleteAlienAtom({ ctx, ...params }),
	};
};
