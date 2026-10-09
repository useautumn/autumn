import { isDeepStrictEqual } from "node:util";
import {
	type ByocCacheDeployment,
	ByocCacheStage,
	ByocCacheStatus,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getAtomDeployer } from "../deployers/getAtomDeployer.js";
import type { AtomDeployment } from "../deployers/types/atomDeployer.js";
import {
	deleteCacheDeployment,
	updateCacheDeployment,
} from "../repos/cacheDeployments.js";
import {
	atomTokenToHash,
	cacheDeploymentToAtomToken,
} from "../utils/atomTokenUtils.js";
import { toCacheStages } from "../utils/cacheStageUtils.js";
import { isCacheBeingRemoved } from "../utils/classifyCacheDeployment.js";
import { isAtomReachable } from "../utils/isAtomReachable.js";

/** Connected is the last step: a running Atom whose endpoint Autumn reaches. */
const isDeploymentReachable = async ({
	deployment,
}: {
	deployment: AtomDeployment | null;
}): Promise<boolean> => {
	if (deployment?.status !== ByocCacheStatus.Ready) return false;
	if (!deployment.endpointUrl) return false;
	return isAtomReachable({ endpointUrl: deployment.endpointUrl });
};

const deploymentToCacheDeployment = async ({
	cacheDeployment,
	deployment,
}: {
	cacheDeployment: ByocCacheDeployment;
	deployment: AtomDeployment | null;
}): Promise<ByocCacheDeployment> => {
	const status = deployment?.status ?? ByocCacheStatus.AwaitingSetup;
	const isReachable = await isDeploymentReachable({ deployment });
	const doneStages = [
		...(deployment?.doneStages ?? []),
		...(isReachable ? [ByocCacheStage.Connected] : []),
	];
	return {
		...cacheDeployment,
		deployment_id: deployment?.id ?? null,
		status,
		endpoint_url: deployment?.endpointUrl ?? null,
		// Until setup creates a deployment, the record keeps the machine and region its setup asked for.
		cpu: deployment ? (deployment.machine?.cpu ?? null) : cacheDeployment.cpu,
		memory: deployment
			? (deployment.machine?.memory ?? null)
			: cacheDeployment.memory,
		region: deployment?.region ?? cacheDeployment.region,
		stages: toCacheStages({ doneStages, status }),
		error: deployment?.error ?? null,
		token_hash:
			cacheDeployment.token_hash ??
			atomTokenToHash({
				token: cacheDeploymentToAtomToken({ cacheDeployment }),
			}),
	};
};

/** Reads the Atom's state from its deployer and saves it when it moved; null once a delete has finished. */
export const refreshCacheDeployment = async ({
	ctx,
	cacheDeployment,
}: {
	ctx: AutumnContext;
	cacheDeployment: ByocCacheDeployment;
}): Promise<ByocCacheDeployment | null> => {
	const deployment = await getAtomDeployer().find({
		deploymentGroupId: cacheDeployment.deployment_group_id,
		deploymentId: cacheDeployment.deployment_id,
	});

	const isRemovalDone = !deployment && isCacheBeingRemoved({ cacheDeployment });
	if (isRemovalDone) {
		await deleteCacheDeployment({ ctx, cacheDeployment });
		return null;
	}

	const refreshed = await deploymentToCacheDeployment({
		cacheDeployment,
		deployment,
	});
	if (!isDeepStrictEqual(refreshed, cacheDeployment))
		await updateCacheDeployment({ ctx, from: cacheDeployment, to: refreshed });
	return refreshed;
};
