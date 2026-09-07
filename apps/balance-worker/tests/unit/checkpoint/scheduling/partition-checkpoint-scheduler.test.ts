import { describe, expect, test } from "bun:test";
import { createOutcome } from "../../kafka/kafka-test-fixtures.js";
import { createSchedulerFixture } from "./scheduler-fixtures.js";

describe("partition checkpoint scheduler", () => {
	test("drains eligible partitions without an extra poll interval between uploads", async () => {
		const publications: number[] = [];
		const fixture = createSchedulerFixture({
			publish: async ({ checkpoint }) => {
				publications.push(checkpoint.partition);
				return { kind: "published", etag: "etag" };
			},
		});
		try {
			for (const partition of [0, 1, 2]) {
				fixture.initialize({ partition });
				fixture.start({ partition });
			}
			await fixture.clock.advance(100);
			expect(publications).toEqual([0, 1, 2]);
		} finally {
			await fixture.close();
		}
	});

	test("automatically publishes once, then skips unchanged state locally", async () => {
		let publications = 0;
		const fixture = createSchedulerFixture({
			publish: async () => {
				publications++;
				return { kind: "published", etag: "etag" };
			},
		});
		try {
			fixture.initialize({ partition: 0 });
			const { lease } = fixture.start({ partition: 0 });
			await fixture.clock.advance(99);
			expect(publications).toBe(0);
			await fixture.clock.advance(1);
			expect(publications).toBe(1);
			expect(lease.getHealth()).toMatchObject({
				status: "up_to_date",
				lastConfirmedNextOffset: 1n,
				failure: null,
			});
			await fixture.clock.advance(300);
			expect(publications).toBe(1);
		} finally {
			await fixture.close();
		}
	});

	test("holds one export slot and preserves changes arriving during an upload", async () => {
		const first = Promise.withResolvers<{ kind: "published"; etag: string }>();
		const offsets: bigint[] = [];
		const fixture = createSchedulerFixture({
			publish: async ({ checkpoint }) => {
				offsets.push(checkpoint.nextOffset);
				return offsets.length === 1
					? first.promise
					: { kind: "published", etag: "next" };
			},
			configuration: { exportTimeoutMs: 1_000 },
		});
		try {
			const state = fixture.initialize({ partition: 0 });
			fixture.initialize({ partition: 1 });
			const { lease } = fixture.start({ partition: 0 });
			fixture.start({ partition: 1 });
			await fixture.clock.advance(100);
			fixture.store.applyDurableTrackOutcome({
				position: { topic: fixture.topic, partition: 0, offset: 1n },
				outcome: createOutcome({ state }),
			});
			await fixture.clock.advance(50);
			expect(offsets).toEqual([1n]);
			first.resolve({ kind: "published", etag: "first" });
			await fixture.clock.settle();
			expect(lease.getHealth().dirtySince).not.toBeNull();
			await fixture.clock.advance(200);
			expect(offsets).toEqual([1n, 1n, 2n]);
			expect(lease.getHealth().lastConfirmedNextOffset).toBe(2n);
		} finally {
			first.resolve({ kind: "published", etag: "cleanup" });
			await fixture.close();
		}
	});

	test("records a confirmed newer S3 offset without pretending it published", async () => {
		let publications = 0;
		const fixture = createSchedulerFixture({
			publish: async () => {
				publications++;
				return { kind: "skipped", remoteNextOffset: 5n };
			},
		});
		try {
			fixture.initialize({ partition: 0 });
			const { lease } = fixture.start({ partition: 0 });
			await fixture.clock.advance(300);
			expect(publications).toBe(1);
			expect(lease.getHealth()).toMatchObject({
				lastConfirmedNextOffset: 5n,
				lastPublishedAt: null,
				status: "up_to_date",
			});
		} finally {
			await fixture.close();
		}
	});

	test("checkpoints a newly consumed marker without changing SQLite", async () => {
		const offsets: bigint[] = [];
		const fixture = createSchedulerFixture({
			publish: async ({ checkpoint }) => {
				offsets.push(checkpoint.nextOffset);
				return { kind: "published", etag: "etag" };
			},
		});
		try {
			fixture.initialize({ partition: 0 });
			let consumed = 1n;
			fixture.start({ partition: 0, consumed: () => consumed });
			await fixture.clock.advance(100);
			consumed = 2n;
			await fixture.clock.advance(200);
			expect(offsets).toEqual([1n, 2n]);
			expect(
				fixture.store.readNextOffset({ topic: fixture.topic, partition: 0 }),
			).toBe(1n);
		} finally {
			await fixture.close();
		}
	});
});
