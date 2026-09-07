import { describe, expect, test } from "bun:test";
import { PartitionCheckpointLimitExceededError } from "../../../../src/checkpoint/partitionCheckpointLimits.js";
import { PartitionCheckpointPublisherError } from "../../../../src/checkpoint/partitionCheckpointPublisher.js";
import { createSchedulerFixture } from "./scheduler-fixtures.js";

describe("scheduled checkpoint failures", () => {
	test("bounds transient retries, then recovers without a partition failure", async () => {
		let calls = 0;
		let available = false;
		const fixture = createSchedulerFixture({
			publish: async () => {
				calls++;
				if (!available)
					throw new PartitionCheckpointPublisherError({
						message: "S3 unavailable",
						retriable: true,
					});
				return { kind: "published", etag: "recovered" };
			},
		});
		try {
			fixture.initialize({ partition: 0 });
			const { lease } = fixture.start({ partition: 0 });
			await fixture.clock.advance(100);
			expect(lease.getHealth()).toMatchObject({
				status: "degraded",
				failure: { retriable: true },
				lastConfirmedNextOffset: null,
			});
			await fixture.clock.advance(30);
			expect(calls).toBe(3);
			await fixture.clock.advance(90);
			expect(calls).toBe(3);
			available = true;
			await fixture.clock.advance(10);
			expect(calls).toBe(4);
			expect(lease.getHealth()).toMatchObject({
				status: "up_to_date",
				failure: null,
			});
			expect(fixture.failures).toEqual([]);
		} finally {
			fixture.close();
		}
	});

	test("reports an exceeded limit explicitly without rapid retry or losing ownership", async () => {
		const fixture = createSchedulerFixture();
		try {
			fixture.initialize({ partition: 0 });
			let captures = 0;
			fixture.store.capturePartitionCheckpoint = () => {
				captures++;
				throw new PartitionCheckpointLimitExceededError({
					limitName: "states",
					limit: 100,
					observed: 101,
				});
			};
			const { lease, controller } = fixture.start({ partition: 0 });
			await fixture.clock.advance(150);
			expect(captures).toBe(1);
			expect(lease.getHealth()).toMatchObject({
				status: "degraded",
				failure: {
					name: "PartitionCheckpointLimitExceededError",
					limitName: "states",
					limit: 100,
					observed: 101,
					retriable: false,
				},
			});
			expect(controller.signal.aborted).toBe(false);
			expect(fixture.failures).toEqual([]);
		} finally {
			fixture.close();
		}
	});

	test("aborts a timed-out upload and retries only after it settles", async () => {
		let signal: AbortSignal | null = null;
		const fixture = createSchedulerFixture({
			publish: ({ signal: currentSignal }) => {
				signal = currentSignal;
				return new Promise((_resolve, reject) =>
					currentSignal.addEventListener(
						"abort",
						() => reject(currentSignal.reason),
						{ once: true },
					),
				);
			},
		});
		try {
			fixture.initialize({ partition: 0 });
			const { lease } = fixture.start({ partition: 0 });
			await fixture.clock.advance(100);
			expect(signal).not.toBeNull();
			await fixture.clock.advance(50);
			expect(lease.getHealth()).toMatchObject({
				status: "degraded",
				failure: {
					name: "PartitionCheckpointExportTimeoutError",
					retriable: true,
				},
			});
			expect(fixture.failures).toEqual([]);
		} finally {
			fixture.close();
		}
	});

	test("routes corrupt local state through the runtime failure hook", async () => {
		const fixture = createSchedulerFixture();
		try {
			fixture.initialize({ partition: 0 });
			const failure = new Error("database disk image is malformed");
			fixture.store.capturePartitionCheckpoint = () => {
				throw failure;
			};
			const { controller } = fixture.start({ partition: 0 });
			await fixture.clock.advance(100);
			expect(fixture.failures).toEqual([failure]);
			expect(controller.signal.aborted).toBe(true);
		} finally {
			fixture.close();
		}
	});
});
