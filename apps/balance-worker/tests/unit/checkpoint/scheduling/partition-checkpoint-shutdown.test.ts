import { describe, expect, test } from "bun:test";
import { createSchedulerFixture } from "./scheduler-fixtures.js";

describe("checkpoint scheduler shutdown", () => {
	test.concurrent(
		"also waits when a synchronous maintenance callback initiates shutdown",
		async () => {
			const yielded = Promise.withResolvers<void>();
			const fixture = createSchedulerFixture();
			let stopping: Promise<void> | undefined;
			try {
				fixture.initialize({ partition: 0 });
				fixture.clock.yield = () => yielded.promise;
				fixture.store.pruneExpiredTrackReceipts = () => {
					stopping = fixture.scheduler.stop();
					return { deletedCount: 0 };
				};
				fixture.start({ partition: 0 });
				await fixture.clock.advance(100);
				expect(stopping).toBeDefined();
				let settled = false;
				const completion = Promise.resolve(stopping).then(() => {
					settled = true;
				});
				await fixture.clock.settle();
				expect(settled).toBe(false);
				yielded.resolve();
				await completion;
			} finally {
				yielded.resolve();
				await fixture.scheduler.stop();
				await fixture.close();
			}
		},
	);
	test.concurrent(
		"waits for the cancelled export continuation and shares repeated stop completion",
		async () => {
			const publication = Promise.withResolvers<void>();
			const fixture = createSchedulerFixture({
				publish: async () => {
					await publication.promise;
					return { kind: "published", etag: "late" };
				},
			});
			try {
				fixture.initialize({ partition: 0 });
				const { lease } = fixture.start({ partition: 0 });
				await fixture.clock.advance(100);
				expect(lease.getHealth().status).toBe("exporting");
				const stopping = fixture.scheduler.stop();
				expect(fixture.scheduler.stop()).toBe(stopping);
				let settled = false;
				const stopped = Promise.resolve(stopping).then(() => {
					settled = true;
				});
				await fixture.clock.settle();
				expect(settled).toBe(false);
				publication.resolve();
				await stopped;
				expect(lease.getHealth().lastPublishedAt).toBeNull();
				expect(lease.getHealth().status).toBe("stopped");
				expect(fixture.clock.pendingTimers).toBe(0);
			} finally {
				publication.resolve();
				await fixture.scheduler.stop();
				await fixture.close();
			}
		},
	);

	test.concurrent(
		"waits for a yielded cleanup loop and performs no more deletes after stop",
		async () => {
			const yielded = Promise.withResolvers<void>();
			const fixture = createSchedulerFixture();
			try {
				fixture.initialize({ partition: 0 });
				fixture.initialize({ partition: 1 });
				fixture.clock.yield = () => yielded.promise;
				const prune = fixture.store.pruneExpiredTrackReceipts.bind(
					fixture.store,
				);
				const deletes: number[] = [];
				fixture.store.pruneExpiredTrackReceipts = (params) => {
					deletes.push(params.partition);
					return prune(params);
				};
				fixture.start({ partition: 0 });
				fixture.start({ partition: 1 });
				await fixture.clock.advance(100);
				expect(deletes).toEqual([0]);
				let settled = false;
				const stopped = Promise.resolve(fixture.scheduler.stop()).then(() => {
					settled = true;
				});
				await fixture.clock.settle();
				expect(settled).toBe(false);
				yielded.resolve();
				await stopped;
				expect(deletes).toEqual([0]);
				expect(fixture.clock.pendingTimers).toBe(0);
			} finally {
				yielded.resolve();
				await fixture.scheduler.stop();
				await fixture.close();
			}
		},
	);
});
