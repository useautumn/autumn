import type {
	ShadowAtomConfig,
	ShadowAtomDeploymentEntry,
} from "@autumn/edge-config";
import {
	ApiByocCacheSchema,
	type ByocCacheMachine,
	type ByocCacheNetwork,
	ByocCacheStatus,
} from "@autumn/shared";
import { z } from "zod/v4";
import { withLock } from "@/external/redis/utils/lockUtils/withLock.js";
import type { AtomStorage } from "@/internal/byoc/atomRecords/types/atomStorage.js";
import { toCacheStages } from "@/internal/byoc/utils/cacheStageUtils.js";
import { isCacheBeingRemoved } from "@/internal/byoc/utils/classifyCacheDeployment.js";
import { pickChangedFields } from "@/internal/byoc/utils/pickChangedFields.js";
import {
	SHADOW_ATOM_CONFIG_LOCK_KEY,
	shadowAtomConfigStore,
} from "./shadowAtomConfigStore.js";
import { shadowAtomRecordNames } from "./shadowAtomNames.js";
import type {
	ShadowAtomRecord,
	ShadowAtomRecords,
} from "./types/shadowAtomRecord.js";

const ShadowAtomDeploymentSchema = ApiByocCacheSchema.pick({
	deployment_id: true,
	status: true,
	cpu: true,
	memory: true,
	region: true,
	stages: true,
	error: true,
	created_at: true,
}).extend({
	network: ApiByocCacheSchema.shape.network.default(null),
	atom_id: z.string().nullable().default(null),
	stack_name: z.string().nullable().default(null),
});

export const awaitingShadowAtomRecord = ({
	deploymentGroupId,
	atomId,
	stackName,
	machine,
	region,
	network = null,
}: {
	deploymentGroupId: string;
	atomId: string | null;
	stackName: string | null;
	machine: ByocCacheMachine | null;
	region: string | null;
	network?: ByocCacheNetwork | null;
}): ShadowAtomRecord => {
	const status = ByocCacheStatus.AwaitingSetup;
	return {
		atom_id: atomId,
		stack_name: stackName,
		deployment_group_id: deploymentGroupId,
		deployment_id: null,
		status,
		endpoint_url: null,
		cpu: machine?.cpu ?? null,
		memory: machine?.memory ?? null,
		region,
		network,
		stages: toCacheStages({ doneStages: [], status }),
		error: null,
		created_at: Date.now(),
	};
};

const entryToShadowAtomRecord = ({
	entry: { deploymentGroupId, endpointUrl, deployment },
}: {
	entry: Pick<
		ShadowAtomDeploymentEntry,
		"deploymentGroupId" | "endpointUrl"
	> & { deployment: ShadowAtomDeploymentEntry["deployment"] | null };
}): ShadowAtomRecord => {
	const kept = deployment
		? ShadowAtomDeploymentSchema.parse(deployment)
		: awaitingShadowAtomRecord({
				deploymentGroupId,
				atomId: null,
				stackName: null,
				machine: null,
				region: null,
			});
	return {
		...kept,
		deployment_group_id: deploymentGroupId,
		endpoint_url: endpointUrl,
	};
};

const shadowAtomRecordToEntry = ({
	record,
}: {
	record: ShadowAtomRecord;
}): ShadowAtomDeploymentEntry => ({
	deploymentGroupId: record.deployment_group_id,
	endpointUrl: record.endpoint_url,
	deployment: ShadowAtomDeploymentSchema.parse(record),
});

const configToShadowAtomRecords = ({
	config,
}: {
	config: ShadowAtomConfig;
}): ShadowAtomRecords => ({
	current: config.deploymentGroupId
		? entryToShadowAtomRecord({
				entry: {
					deploymentGroupId: config.deploymentGroupId,
					endpointUrl: config.endpointUrl,
					deployment: config.deployment,
				},
			})
		: null,
	previous: config.previous.map((entry) => entryToShadowAtomRecord({ entry })),
});

export const shadowAtomRecordToCurrentConfig = ({
	record,
}: {
	record: ShadowAtomRecord | null;
}): Pick<
	ShadowAtomConfig,
	"deploymentGroupId" | "endpointUrl" | "externalId" | "deployment"
> => ({
	deploymentGroupId: record?.deployment_group_id ?? null,
	endpointUrl: record?.endpoint_url ?? null,
	externalId: record && shadowAtomRecordNames({ record }).externalId,
	deployment: record && shadowAtomRecordToEntry({ record }).deployment,
});

const shadowAtomRecordsToConfig = ({
	records: { current, previous },
}: {
	records: ShadowAtomRecords;
}): Partial<ShadowAtomConfig> => {
	const stepsAside =
		current !== null && isCacheBeingRemoved({ cacheDeployment: current });
	return {
		...shadowAtomRecordToCurrentConfig({ record: stepsAside ? null : current }),
		previous: [...previous, ...(stepsAside ? [current] : [])].map((record) =>
			shadowAtomRecordToEntry({ record }),
		),
	};
};

export const findShadowAtomRecords = async (): Promise<ShadowAtomRecords> =>
	configToShadowAtomRecords({
		config: await shadowAtomConfigStore.readFromSource(),
	});

const rewriteShadowAtomRecords = ({
	toRecords,
}: {
	toRecords: (records: ShadowAtomRecords) => ShadowAtomRecords | null;
}): Promise<void> =>
	withLock({
		lockKey: SHADOW_ATOM_CONFIG_LOCK_KEY,
		fn: async () => {
			const config = await shadowAtomConfigStore.readFromSource();
			const records = toRecords(configToShadowAtomRecords({ config }));
			if (records)
				await shadowAtomConfigStore.writeToSource({
					config: { ...config, ...shadowAtomRecordsToConfig({ records }) },
				});
		},
	});

const replaceRecordOfGroup = ({
	records: { current, previous },
	deploymentGroupId,
	toRecord,
}: {
	records: ShadowAtomRecords;
	deploymentGroupId: string;
	toRecord: (record: ShadowAtomRecord) => ShadowAtomRecord | null;
}): ShadowAtomRecords | null => {
	const isOfGroup = (record: ShadowAtomRecord | null) =>
		record?.deployment_group_id === deploymentGroupId;
	if (isOfGroup(current) && current)
		return { current: toRecord(current), previous };
	const index = previous.findIndex(isOfGroup);
	if (index === -1) return null;
	const replaced = toRecord(previous[index]);
	return {
		current,
		previous: previous.flatMap((record, i) =>
			i !== index ? [record] : replaced ? [replaced] : [],
		),
	};
};

export const shadowAtomStorage = ({
	deploymentGroupId,
}: {
	deploymentGroupId: string;
}): AtomStorage<ShadowAtomRecord> => ({
	find: async () => {
		const { current, previous } = await findShadowAtomRecords();
		return (
			[current, ...previous].find(
				(record) => record?.deployment_group_id === deploymentGroupId,
			) ?? null
		);
	},
	update: ({ from, to }) =>
		rewriteShadowAtomRecords({
			toRecords: (records) => {
				const changed = pickChangedFields({ from, to });
				if (Object.keys(changed).length === 0) return null;
				return replaceRecordOfGroup({
					records,
					deploymentGroupId,
					toRecord: (current) =>
						current.status === from.status
							? { ...current, ...changed }
							: current,
				});
			},
		}),
	forget: () =>
		rewriteShadowAtomRecords({
			toRecords: (records) =>
				replaceRecordOfGroup({
					records,
					deploymentGroupId,
					toRecord: () => null,
				}),
		}),
});
