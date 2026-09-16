import { describe, expect, test } from "bun:test";
import { createOutcome } from "../../kafka/kafka-test-fixtures.js";
import { createSchedulerFixture } from "./scheduler-fixtures.js";

const addReceipts = (fixture: ReturnType<typeof createSchedulerFixture>) => {
	const state = fixture.initialize({ partition: 0 });
	for (let index = 0; index < 4; index++) {
		const current = fixture.store.readState({ identity: state.identity });
		if (!current) throw new Error("Expected seeded state");
		const outcome = {
			...createOutcome({ state: current, commandId: `receipt_${index}` }),
			deduplicationExpiresAt: fixture.clock.now() + (index === 3 ? 1_000 : -1),
		};
		fixture.store.applyDurableTrackOutcome({
			position: {
				topic: fixture.topic,
				partition: 0,
				offset: BigInt(index + 1),
			},
			outcome,
		});
	}
	return state.identity;
};

describe("scheduled receipt cleanup", () => {
	test("bounds synchronous work and preserves live receipts, state, and progress", async () => {
		const fixture = createSchedulerFixture({
			configuration: { cleanupBatchSize: 1 },
		});
		try {
			const identity = addReceipts(fixture);
			const before = fixture.store.readState({ identity });
			const prune = fixture.store.pruneExpiredTrackReceipts.bind(fixture.store);
			fixture.store.pruneExpiredTrackReceipts = (params) => {
				fixture.clock.workTime += 6;
				return prune(params);
			};
			const { lease } = fixture.start({ partition: 0 });
			await fixture.clock.advance(100);
			expect(lease.getHealth().cleanup).toMatchObject({
				deletedReceipts: 1,
				backlog: "possible",
				lastDurationMs: 6,
			});
			await fixture.clock.advance(300);
			expect(lease.getHealth().cleanup).toMatchObject({
				deletedReceipts: 3,
				backlog: "clear",
			});
			expect(
				fixture.store.readTrackReceipt({ identity, commandId: "receipt_3" }),
			).not.toBeNull();
			expect(fixture.store.readState({ identity })).toEqual(before);
			expect(
				fixture.store.readNextOffset({ topic: fixture.topic, partition: 0 }),
			).toBe(5n);
		} finally {
			await fixture.close();
		}
	});

	test("yields between chunks and stops pruning immediately on revoke", async () => {
		const fixture = createSchedulerFixture({
			configuration: { cleanupBatchSize: 1 },
		});
		try {
			addReceipts(fixture);
			const { controller, lease } = fixture.start({ partition: 0 });
			fixture.clock.onYield = () => controller.abort(new Error("revoked"));
			await fixture.clock.advance(200);
			expect(lease.getHealth().cleanup.deletedReceipts).toBe(1);
			expect(lease.getHealth().status).toBe("stopped");
		} finally {
			await fixture.close();
		}
	});
});
