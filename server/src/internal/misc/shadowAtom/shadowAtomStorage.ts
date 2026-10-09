import type { ShadowAtomConfig } from "@autumn/edge-config";
import {
	ApiByocCacheSchema,
	type ByocCacheMachine,
	ByocCacheStatus,
} from "@autumn/shared";
import type { AtomStorage } from "@/internal/byoc/atomRecords/types/atomStorage.js";
import { toCacheStages } from "@/internal/byoc/utils/cacheStageUtils.js";
import { patchShadowAtomConfig } from "./actions/patchShadowAtomConfig.js";
import { shadowAtomConfigStore } from "./shadowAtomConfigStore.js";
import type { ShadowAtomRecord } from "./types/shadowAtomRecord.js";

/** The record but for its group and endpoint, which sit beside it in the file because herald and the shadow check route by them. */
const ShadowAtomDeploymentSchema = ApiByocCacheSchema.pick({
	deployment_id: true,
	status: true,
	cpu: true,
	memory: true,
	region: true,
	stages: true,
	error: true,
	created_at: true,
});

/** A setup just started: nothing deployed yet, only the machine and region it asked for. */
export const awaitingShadowAtomRecord = ({
	deploymentGroupId,
	machine,
	region,
}: {
	deploymentGroupId: string;
	machine: ByocCacheMachine | null;
	region: string | null;
}): ShadowAtomRecord => {
	const status = ByocCacheStatus.AwaitingSetup;
	return {
		deployment_group_id: deploymentGroupId,
		deployment_id: null,
		status,
		endpoint_url: null,
		cpu: machine?.cpu ?? null,
		memory: machine?.memory ?? null,
		region,
		stages: toCacheStages({ doneStages: [], status }),
		error: null,
		created_at: Date.now(),
	};
};

const configToShadowAtomRecord = ({
	config: { deploymentGroupId, endpointUrl, deployment },
}: {
	config: ShadowAtomConfig;
}): ShadowAtomRecord | null => {
	if (!deploymentGroupId) return null;
	// A file from before the record was kept reads as a setup just started; its first refresh fills it in.
	const kept = deployment
		? ShadowAtomDeploymentSchema.parse(deployment)
		: awaitingShadowAtomRecord({
				deploymentGroupId,
				machine: null,
				region: null,
			});
	return {
		...kept,
		deployment_group_id: deploymentGroupId,
		endpoint_url: endpointUrl,
	};
};

export const shadowAtomRecordToConfig = ({
	record,
}: {
	record: ShadowAtomRecord;
}): Pick<
	ShadowAtomConfig,
	"deploymentGroupId" | "endpointUrl" | "deployment"
> => ({
	deploymentGroupId: record.deployment_group_id,
	endpointUrl: record.endpoint_url,
	deployment: ShadowAtomDeploymentSchema.parse(record),
});

const findShadowAtomRecord = async (): Promise<ShadowAtomRecord | null> =>
	configToShadowAtomRecord({
		config: await shadowAtomConfigStore.readFromSource(),
	});

const updateShadowAtomRecord = ({
	from,
	to,
}: {
	from: ShadowAtomRecord;
	to: ShadowAtomRecord;
}): Promise<void> =>
	patchShadowAtomConfig({
		patch: shadowAtomRecordToConfig({ record: to }),
		followingGroupId: from.deployment_group_id,
	});

const forgetShadowAtomRecord = ({
	record,
}: {
	record: ShadowAtomRecord;
}): Promise<void> =>
	patchShadowAtomConfig({
		patch: { deploymentGroupId: null, endpointUrl: null, deployment: null },
		followingGroupId: record.deployment_group_id,
	});

/** Our shadow Atom's record in its edge config, in place of an org's `atom_deployments` row. */
export const shadowAtomStorage: AtomStorage<ShadowAtomRecord> = {
	find: findShadowAtomRecord,
	update: updateShadowAtomRecord,
	forget: forgetShadowAtomRecord,
};
