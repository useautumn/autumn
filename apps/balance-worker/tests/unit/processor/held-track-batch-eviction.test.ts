import { expect, test } from "bun:test";
import { createSubjectState } from "@autumn/balance-engine";
import { workerErrorOf } from "../../../src/http/handlers/errorHandler/workerErrorOf.js";
import { createPartitionProcessor } from "../../../src/processor/createPartitionProcessor.js";
import { createRecentCommands } from "../../../src/processor/writer/recentCommands/createRecentCommands.js";
import { createCommitPositions } from "../../../src/runtime/commitPositions/createCommitPositions.js";
import {
	createSyntheticWorkerDb,
	createTestCatalogCache,
} from "../../fixtures/catalog.js";
import {
	gatedAppender,
	identity,
	openStore,
	partition,
	topic,
	trackCommand,
	waitForAppend,
} from "../../fixtures/heldTrack.js";
import {
	createCustomerEntitlement,
	restoreSubjectStates,
} from "../../fixtures/mutations.js";

test("a batch member cleared by the pre-check is not evicted by an earlier member's decide: every member is answered as the ordinary path would", async () => {
	const other = { ...identity, customerId: "cus_2" };
	const { store, close } = openStore();
	restoreSubjectStates({
		store,
		topic,
		partition,
		states: [identity, other].map((who) =>
			createSubjectState({
				identity: who,
				customerEntitlements: [
					createCustomerEntitlement({
						id: "messages_monthly",
						featureId: "messages",
						balance: 100,
					}),
				],
			}),
		),
	});
	let bound = 1 << 30;
	let postgresLike = false;
	const positions = createCommitPositions({ config: { partitionCount: 4 } });
	const appender = gatedAppender();
	const processor = createPartitionProcessor({
		ctx: {
			stateStore: {
				...store,
				// The Postgres store answers a map miss with null: the ordinary path hydrates.
				readOwnState: (params) =>
					postgresLike ? null : store.readOwnState(params),
			},
			appender,
			db: createSyntheticWorkerDb(),
			catalogCache: createTestCatalogCache(),
			receiptPolicy: { retentionMs: 86_400_000, now: () => 1_700_000_000_000 },
			recentCommands: createRecentCommands({ windowMs: 600_000, now: () => 0 }),
			commitPositions: positions.sinkFor({ partition }),
			assertCanRead: () => {},
		},
		config: {
			topic,
			partition,
			writerLimits: {
				maxBatchSize: 100,
				maxPendingCommands: 1_000,
				maxPendingCommandsPerCustomer: 100,
				subjectMapBudget: {
					totalBytes: 1 << 30,
					members: () => 1,
					join: () => ({ maxBytes: () => bound, leave: () => {} }),
				},
			},
		},
	});
	try {
		for (const who of [identity, other]) {
			const warm = processor.track({
				command: trackCommand({ commandId: `warm_${who.customerId}`, who }),
			});
			let done = false;
			void warm.finally(() => {
				done = true;
			});
			for (let turn = 0; turn < 200 && !done; turn++) {
				await waitForAppend();
				try {
					appender.release();
				} catch {}
			}
			await warm;
		}
		await processor.drain();
		postgresLike = true;
		// The worker's share shrinks (e.g. another partition joins the budget).
		bound = 1;
		const outcome = processor.trackBatchInline({
			commands: [
				trackCommand({ commandId: "a", who: identity }),
				trackCommand({ commandId: "b", who: other }),
			],
		});
		if (outcome.kind !== "decided") throw new Error("refused");
		const items = outcome.items.map((item) =>
			item.ok
				? { ok: true }
				: { ok: false, ...workerErrorOf({ cause: item.cause }) },
		);
		expect(items).toEqual([{ ok: true }, { ok: true }]);
	} finally {
		processor.dispose();
		close();
	}
});
