import { isDeepStrictEqual } from "node:util";
import { type ByocCacheDeployment, ByocCacheStatus } from "@autumn/shared";
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
import { toCacheStages, toRemovalStages } from "../utils/cacheStageUtils.js";
import { isCacheBeingRemoved } from "../utils/classifyCacheDeployment.js";

const deploymentToCacheDeployment = ({
	cacheDeployment,
	deployment,
}: {
	cacheDeployment: ByocCacheDeployment;
	deployment: AtomDeployment | null;
}): ByocCacheDeployment => {
	const reportedStatus = deployment?.status ?? ByocCacheStatus.AwaitingSetup;
	// A delete never goes back: the env may already have a new Atom in its place.
	const isStillRemoving =
		isCacheBeingRemoved({ cacheDeployment }) &&
		!isCacheBeingRemoved({
			cacheDeployment: { ...cacheDeployment, status: reportedStatus },
		});
	const status = isStillRemoving ? cacheDeployment.status : reportedStatus;
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
		stages: isCacheBeingRemoved({
			cacheDeployment: { ...cacheDeployment, status },
		})
			? toRemovalStages({
					removedStages: deployment?.removedStages ?? [],
					hasFailed: Boolean(deployment?.error),
				})
			: toCacheStages({ doneStages: deployment?.doneStages ?? [], status }),
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

	const refreshed = deploymentToCacheDeployment({
		cacheDeployment,
		deployment,
	});
	if (!isDeepStrictEqual(refreshed, cacheDeployment))
		await updateCacheDeployment({ ctx, from: cacheDeployment, to: refreshed });
	return refreshed;
};
