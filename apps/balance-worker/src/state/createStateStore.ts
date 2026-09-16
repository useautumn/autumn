import type { Database } from "bun:sqlite";
import { applyDurableMutations } from "./actions/applyDurableMutations/applyDurableMutations.js";
import { capturePartitionCheckpoint } from "./actions/checkpoint/capturePartitionCheckpoint.js";
import { restorePartitionCheckpoint } from "./actions/checkpoint/restorePartitionCheckpoint.js";
import { initializePartition } from "./actions/initializePartition.js";
import { pruneExpiredReceipts } from "./actions/pruneExpiredReceipts.js";
import { assertPartition, assertTopic } from "./assertKafkaPosition.js";
import { readReceipt } from "./repos/mutationReceipts/mutationReceipts.js";
import { readNextOffset } from "./repos/partitionProgress.js";
import { readStoredState } from "./repos/subjectStates/subjectStates.js";
import type { StateStore } from "./types/stateStore.js";
import type { StateStoreContext } from "./types/stateStoreContext.js";

type CaptureParams = Parameters<StateStore["capturePartitionCheckpoint"]>[0];
type PruneParams = Parameters<StateStore["pruneExpiredReceipts"]>[0];

export const createStateStore = ({
	sqliteDb,
}: {
	sqliteDb: Database;
}): StateStore => {
	const ctx: StateStoreContext = { sqliteDb };

	const captureCheckpoint = (params: CaptureParams) => {
		assertTopic({ topic: params.topic });
		assertPartition({ partition: params.partition });
		return capturePartitionCheckpoint({ ctx, ...params });
	};

	const pruneReceipts = (params: PruneParams) => {
		assertTopic({ topic: params.topic });
		assertPartition({ partition: params.partition });
		return pruneExpiredReceipts({ ctx, ...params });
	};

	return {
		initializePartition: (params) => initializePartition({ ctx, ...params }),
		restorePartitionCheckpoint: (params) =>
			restorePartitionCheckpoint({ ctx, ...params }),
		capturePartitionCheckpoint: captureCheckpoint,
		pruneExpiredReceipts: pruneReceipts,
		readState: ({ identity }) =>
			readStoredState({ ctx, identity })?.state ?? null,
		readReceipt: ({ identity, mutationId }) =>
			readReceipt({ ctx, identity, mutationId })?.mutation ?? null,
		readNextOffset: (params) => readNextOffset({ ctx, ...params }),
		applyDurableMutations: ({ records }) =>
			applyDurableMutations({ ctx, records }),
		close: () => sqliteDb.close(true),
	};
};
