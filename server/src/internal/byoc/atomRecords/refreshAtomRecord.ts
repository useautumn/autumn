import { isDeepStrictEqual } from "node:util";
import { ByocCacheStatus } from "@autumn/shared";
import type { AtomDeployment } from "../deployers/types/atomDeployer.js";
import { toCacheStages, toRemovalStages } from "../utils/cacheStageUtils.js";
import { isCacheBeingRemoved } from "../utils/classifyCacheDeployment.js";
import type { AtomContext } from "./types/atomContext.js";
import type { AtomRecord } from "./types/atomRecord.js";

const deploymentToAtomRecord = <T extends AtomRecord>({
	record,
	deployment,
}: {
	record: T;
	deployment: AtomDeployment | null;
}): T => {
	const reportedStatus = deployment?.status ?? ByocCacheStatus.AwaitingSetup;
	// A delete never goes back: the env may already have a new Atom in its place.
	const isStillRemoving =
		isCacheBeingRemoved({ cacheDeployment: record }) &&
		!isCacheBeingRemoved({ cacheDeployment: { status: reportedStatus } });
	const status = isStillRemoving ? record.status : reportedStatus;
	return {
		...record,
		deployment_id: deployment?.id ?? null,
		status,
		endpoint_url: deployment?.endpointUrl ?? null,
		// Until setup creates a deployment, the record keeps the machine and region its setup asked for.
		cpu: deployment ? (deployment.machine?.cpu ?? null) : record.cpu,
		memory: deployment ? (deployment.machine?.memory ?? null) : record.memory,
		region: deployment?.region ?? record.region,
		stages: isCacheBeingRemoved({ cacheDeployment: { status } })
			? toRemovalStages({
					removedStages: deployment?.removedStages ?? [],
					hasFailed: Boolean(deployment?.error),
				})
			: toCacheStages({ doneStages: deployment?.doneStages ?? [], status }),
		error: deployment?.error ?? null,
	};
};

/** Reads the Atom's state from its deployer and saves it when it moved; null once a delete has finished. */
export const refreshAtomRecord = async <T extends AtomRecord>({
	ctx,
	record,
}: {
	ctx: AtomContext<T>;
	record: T;
}): Promise<T | null> => {
	const deployment = await ctx.deployer.find({
		deploymentGroupId: record.deployment_group_id,
		deploymentId: record.deployment_id,
	});

	const isRemovalDone =
		!deployment && isCacheBeingRemoved({ cacheDeployment: record });
	if (isRemovalDone) {
		await ctx.storage.forget({ record });
		return null;
	}

	const refreshed = deploymentToAtomRecord({ record, deployment });
	if (!isDeepStrictEqual(refreshed, record))
		await ctx.storage.update({ from: record, to: refreshed });
	return refreshed;
};
