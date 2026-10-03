import type { MeteringIdentity, SubjectState } from "@autumn/balance-engine";
import { createCommitterStateStore } from "../../src/committer/createCommitterStateStore.js";
import { createPartitionProcessor } from "../../src/processor/createPartitionProcessor.js";
import type { PartitionProcessorConfig } from "../../src/processor/types/partitionProcessor.js";
import { createRecentCommands } from "../../src/processor/writer/recentCommands/createRecentCommands.js";
import { createSyntheticWorkerDb, createTestCatalogCache } from "./catalog.js";
import { createInitializeRequest, testOccurredAt } from "./mutations.js";

export const residentIdentityOf = ({
	customerId,
}: {
	customerId: string;
}): MeteringIdentity => ({
	orgId: "org_1",
	env: "sandbox",
	customerId,
	entityId: null,
});

/** The production shape: the Postgres-backed store, so subjects live in the map as one object per state. */
export const createResidentProcessor = async ({
	states,
	config = {},
}: {
	states: SubjectState[];
	config?: Partial<PartitionProcessorConfig>;
}) => {
	const stateStore = createCommitterStateStore({
		ctx: {
			committer: {
				apply: async ({ records, expectedOffset }) => ({
					nextOffset:
						(records.at(-1)?.position.offset ?? expectedOffset - 1n) + 1n,
				}),
				drain: async () => undefined,
				stop: () => undefined,
			},
			db: {
				readPartitionProgress: async () => null,
				insertPartitionProgress: async () => undefined,
				claimPartitionProgress: async () => undefined,
			},
		},
	});
	await stateStore.initializePartition({
		topic: "outcomes",
		partition: 0,
		nextOffset: 0n,
	});
	let appended = 0n;
	const processor = createPartitionProcessor({
		ctx: {
			stateStore: {
				...stateStore,
				readCommandNextOffset: () => null,
				advanceCommandNextOffset: async () => undefined,
			},
			catalogCache: createTestCatalogCache(),
			db: createSyntheticWorkerDb(),
			appender: {
				appendCommitted: async ({ outcomes }) => {
					const baseOffset = appended;
					appended += BigInt(outcomes.length);
					return { baseOffset };
				},
			},
			receiptPolicy: { retentionMs: 86_400_000, now: () => testOccurredAt },
			recentCommands: createRecentCommands({ windowMs: 600_000, now: () => 0 }),
			assertCanRead: () => undefined,
		},
		config: {
			topic: "outcomes",
			partition: 0,
			writerLimits: {
				maxBatchSize: 100,
				maxPendingCommands: 1_000,
				maxPendingCommandsPerCustomer: 1_000,
			},
			...config,
		},
	});
	for (const [index, state] of states.entries())
		await processor.initialize({
			request: createInitializeRequest({
				state,
				commandId: `init_${index}`,
				requestId: `req_init_${index}`,
			}),
		});
	return processor;
};
