import { describe, expect, test } from "bun:test";
import { CorruptBalanceStateError } from "../../../../src/state/sqliteBalanceStateErrors.js";
import { createSchedulerFixture } from "./scheduler-fixtures.js";

describe("receipt cleanup failures", () => {
	test.concurrent(
		"degrades and retries a failed delete without revoking the partition",
		async () => {
			const fixture = createSchedulerFixture();
			try {
				fixture.initialize({ partition: 0 });
				const prune = fixture.store.pruneExpiredTrackReceipts.bind(
					fixture.store,
				);
				const cause = Object.assign(new Error("database is busy"), {
					code: "SQLITE_BUSY",
				});
				let attempts = 0;
				fixture.store.pruneExpiredTrackReceipts = (params) => {
					attempts++;
					if (attempts === 1) throw cause;
					return prune(params);
				};
				const { controller, lease } = fixture.start({ partition: 0 });
				await fixture.clock.advance(100);
				expect(controller.signal.aborted).toBe(false);
				expect(fixture.failures).toEqual([]);
				expect(lease.getHealth().cleanup).toMatchObject({
					status: "degraded",
					nextAttemptAt: fixture.clock.now() + 100,
					backlog: "unknown",
					failure: { message: cause.message, retriable: true },
				});
				await fixture.clock.advance(200);
				expect(attempts).toBeGreaterThan(1);
				expect(lease.getHealth().cleanup).toMatchObject({
					backlog: "clear",
					failure: null,
				});
			} finally {
				await fixture.close();
			}
		},
	);

	test.concurrent(
		"still escalates corrupt balance state to runtime recovery",
		async () => {
			const fixture = createSchedulerFixture();
			try {
				fixture.initialize({ partition: 0 });
				const cause = new CorruptBalanceStateError({
					partitionKey: "customer",
				});
				fixture.store.pruneExpiredTrackReceipts = () => {
					throw cause;
				};
				const { controller } = fixture.start({ partition: 0 });
				await fixture.clock.advance(100);
				expect(controller.signal.aborted).toBe(true);
				expect(fixture.failures).toEqual([cause]);
			} finally {
				await fixture.close();
			}
		},
	);

	test.concurrent.each([6, 0])(
		"charges failed attempts to the time budget and keeps the next partition eligible",
		async (workMs) => {
			const fixture = createSchedulerFixture({
				configuration: {
					intervalMs: 10_000,
					maxCleanupChunksPerTurn: workMs === 0 ? 1 : 64,
				},
			});
			try {
				fixture.initialize({ partition: 0 });
				fixture.initialize({ partition: 1 });
				const attempts: number[] = [];
				fixture.store.pruneExpiredTrackReceipts = ({ partition }) => {
					attempts.push(partition);
					fixture.clock.workTime += workMs;
					throw new Error("receipt cleanup temporarily unavailable");
				};
				fixture.start({ partition: 0 });
				fixture.start({ partition: 1 });
				await fixture.clock.advance(100);
				expect(attempts).toEqual([0]);
				await fixture.clock.advance(10);
				expect(attempts).toEqual([0, 1]);
				expect(fixture.failures).toEqual([]);
			} finally {
				await fixture.close();
			}
		},
	);
});
