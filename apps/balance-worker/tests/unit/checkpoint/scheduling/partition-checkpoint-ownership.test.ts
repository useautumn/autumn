import { describe, expect, test } from "bun:test";
import { createSchedulerFixture } from "./scheduler-fixtures.js";

describe("checkpoint assignment ownership", () => {
	test("cancels queued work and removes its timers", async () => {
		let calls = 0;
		const fixture = createSchedulerFixture({
			publish: async () => {
				calls++;
				return { kind: "published", etag: "etag" };
			},
		});
		try {
			fixture.initialize({ partition: 0 });
			const { controller, lease } = fixture.start({ partition: 0 });
			controller.abort(new Error("revoked"));
			await fixture.clock.advance(500);
			expect(calls).toBe(0);
			expect(lease.getHealth().status).toBe("stopped");
			expect(fixture.clock.pendingTimers).toBe(0);
		} finally {
			fixture.close();
		}
	});

	test("ignores a late upload from an earlier assignment of the same partition", async () => {
		const upload = Promise.withResolvers<{ kind: "published"; etag: string }>();
		const signals: AbortSignal[] = [];
		const fixture = createSchedulerFixture({
			publish: ({ signal }) => {
				signals.push(signal);
				return signals.length === 1
					? upload.promise
					: Promise.resolve({ kind: "published", etag: "new-owner" });
			},
			configuration: { exportTimeoutMs: 1_000 },
		});
		try {
			fixture.initialize({ partition: 0 });
			const previous = fixture.start({ partition: 0 });
			await fixture.clock.advance(100);
			previous.controller.abort(new Error("revoked"));
			const replacement = fixture.start({ partition: 0 });
			upload.resolve({ kind: "published", etag: "old-owner" });
			await fixture.clock.settle();
			expect(signals[0]?.aborted).toBe(true);
			expect(replacement.lease.getHealth().lastConfirmedNextOffset).toBeNull();
			expect(previous.lease.getHealth().status).toBe("stopped");
			await fixture.clock.advance(100);
			expect(signals).toHaveLength(2);
			expect(replacement.lease.getHealth().lastConfirmedNextOffset).toBe(1n);
		} finally {
			fixture.close();
		}
	});

	test("spreads initial deadlines using the configured jitter", async () => {
		const partitions: number[] = [];
		const fixture = createSchedulerFixture({
			publish: async ({ checkpoint }) => {
				partitions.push(checkpoint.partition);
				return { kind: "published", etag: "etag" };
			},
			configuration: { jitterRatio: 0.2 },
		});
		try {
			fixture.initialize({ partition: 0 });
			fixture.initialize({ partition: 1 });
			fixture.clock.sample = 0;
			fixture.start({ partition: 0 });
			fixture.clock.sample = 1;
			fixture.start({ partition: 1 });
			await fixture.clock.advance(80);
			expect(partitions).toEqual([0]);
			await fixture.clock.advance(40);
			expect(partitions).toEqual([0, 1]);
		} finally {
			fixture.close();
		}
	});
});
