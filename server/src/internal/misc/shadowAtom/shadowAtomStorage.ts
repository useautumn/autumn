import type { ShadowAtomConfig } from "@autumn/edge-config";
import {
	ApiByocCacheSchema,
	type ByocCacheMachine,
	ByocCacheStatus,
} from "@autumn/shared";
import { withLock } from "@/external/redis/utils/lockUtils/withLock.js";
import type { AtomStorage } from "@/internal/byoc/atomRecords/types/atomStorage.js";
import { toCacheStages } from "@/internal/byoc/utils/cacheStageUtils.js";
import { pickChangedFields } from "@/internal/byoc/utils/pickChangedFields.js";
import {
	SHADOW_ATOM_CONFIG_LOCK_KEY,
	shadowAtomConfigStore,
} from "./shadowAtomConfigStore.js";
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

/** Under the config lock, against the record the file holds now; a null patch leaves the file alone. */
const rewriteShadowAtomRecord = ({
	toPatch,
}: {
	toPatch: (
		current: ShadowAtomRecord | null,
	) => Partial<ShadowAtomConfig> | null;
}): Promise<void> =>
	withLock({
		lockKey: SHADOW_ATOM_CONFIG_LOCK_KEY,
		fn: async () => {
			const config = await shadowAtomConfigStore.readFromSource();
			const patch = toPatch(configToShadowAtomRecord({ config }));
			if (patch)
				await shadowAtomConfigStore.writeToSource({
					config: { ...config, ...patch },
				});
		},
	});

/** As an org's row: only what changed, and only while the status is still the one read, so a stale refresh never undoes a delete. */
const updateShadowAtomRecord = ({
	from,
	to,
}: {
	from: ShadowAtomRecord;
	to: ShadowAtomRecord;
}): Promise<void> =>
	rewriteShadowAtomRecord({
		toPatch: (current) => {
			const changed = pickChangedFields({ from, to });
			const isAsRead =
				current?.deployment_group_id === from.deployment_group_id &&
				current.status === from.status;
			if (!current || !isAsRead || Object.keys(changed).length === 0)
				return null;
			return shadowAtomRecordToConfig({ record: { ...current, ...changed } });
		},
	});

const forgetShadowAtomRecord = ({
	record,
}: {
	record: ShadowAtomRecord;
}): Promise<void> =>
	rewriteShadowAtomRecord({
		toPatch: (current) =>
			current?.deployment_group_id === record.deployment_group_id
				? { deploymentGroupId: null, endpointUrl: null, deployment: null }
				: null,
	});

/** Our shadow Atom's record in its edge config, in place of an org's `atom_deployments` row. */
export const shadowAtomStorage: AtomStorage<ShadowAtomRecord> = {
	find: findShadowAtomRecord,
	update: updateShadowAtomRecord,
	forget: forgetShadowAtomRecord,
};
