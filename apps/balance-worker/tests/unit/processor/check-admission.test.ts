import { describe, expect, test } from "bun:test";
import { type CheckCommand, parseCheckCommand } from "@autumn/balance-engine";
import { workerErrorOf } from "../../../src/http/handlers/errorHandler/workerErrorOf.js";
import { CheckCapacityError } from "../../../src/processor/common/processorErrors.js";
import { createPartitionProcessor } from "../../../src/processor/createPartitionProcessor.js";
import { SubjectNotFoundError } from "../../../src/processor/subject/subjectErrors.js";
import { createRecentCommands } from "../../../src/processor/writer/recentCommands/createRecentCommands.js";
import { openStateStore } from "../../../src/state/openStateStore.js";
import {
	createSyntheticWorkerDb,
	createTestCatalogCache,
} from "../../fixtures/catalog.js";
import { testIdentity, testOrg } from "../../fixtures/mutations.js";

const checkOf = ({ customerId }: { customerId: string }): CheckCommand =>
	parseCheckCommand({
		input: {
			schemaVersion: 1,
			type: "check",
			org: testOrg,
			requestId: `req_${customerId}`,
			identity: { ...testIdentity, customerId },
			featureId: "messages",
			internalFeatureId: "feat_messages",
			requiredBalance: 1,
			properties: null,
			occurredAt: 1_700_000_000_000,
		},
	});

/** Every customer is cold and its load waits on `release`, so checks stay in flight until then. */
const createFixture = ({ maxInFlight }: { maxInFlight: number }) => {
	const load = Promise.withResolvers<void>();
	const store = openStateStore({ databasePath: ":memory:" });
	store.initializePartition({
		topic: "outcomes",
		partition: 0,
		nextOffset: 0n,
	});
	const processor = createPartitionProcessor({
		ctx: {
			stateStore: store,
			db: {
				...createSyntheticWorkerDb(),
				getSubjectRows: async () => {
					await load.promise;
					return null;
				},
			},
			catalogCache: createTestCatalogCache(),
			appender: { appendCommitted: async () => ({ baseOffset: 0n }) },
			receiptPolicy: { retentionMs: 86_400_000, now: () => 0 },
			recentCommands: createRecentCommands({ windowMs: 600_000, now: () => 0 }),
			assertCanRead: () => undefined,
		},
		config: {
			topic: "outcomes",
			partition: 0,
			writerLimits: {
				maxBatchSize: 100,
				maxPendingCommands: 100,
				maxPendingCommandsPerCustomer: 100,
			},
			maxInFlightChecksPerCustomer: maxInFlight,
		},
	});
	return {
		processor,
		release: () => load.resolve(),
		close: () => store.close(),
	};
};

describe("check admission", () => {
	test("a customer past its in-flight checks is shed as overloaded; other customers are not", async () => {
		const { processor, release, close } = createFixture({ maxInFlight: 2 });
		try {
			const admitted = [
				processor.check({ command: checkOf({ customerId: "cus_hot" }) }),
				processor.check({ command: checkOf({ customerId: "cus_hot" }) }),
			];
			const neighbour = processor.check({
				command: checkOf({ customerId: "cus_quiet" }),
			});
			await expect(
				processor.check({ command: checkOf({ customerId: "cus_hot" }) }),
			).rejects.toBeInstanceOf(CheckCapacityError);
			expect(processor.readCounters()).toMatchObject({ checksShed: 1 });

			release();
			for (const check of [...admitted, neighbour])
				await expect(check).rejects.toBeInstanceOf(SubjectNotFoundError);
			// Settled checks free their slots.
			await expect(
				processor.check({ command: checkOf({ customerId: "cus_hot" }) }),
			).rejects.toBeInstanceOf(SubjectNotFoundError);
			expect(
				workerErrorOf({ cause: new CheckCapacityError({ customerKey: "k" }) }),
			).toMatchObject({ status: 429, error: { code: "OVERLOADED" } });
		} finally {
			release();
			close();
		}
	});
});
