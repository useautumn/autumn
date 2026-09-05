import { describe, expect, test } from "bun:test";
import { createPartitionRuntime } from "../../../src/runtime/createPartitionRuntime.js";
import { OwnedPartitionNotReadyError } from "../../../src/runtime/runtimeErrors.js";
import type { PartitionOutcomeFollowerPort } from "../../../src/runtime/types/partitionRuntime.js";
import {
	closeStoreFixture,
	createStoreFixture,
	partition,
	topic,
} from "../kafka/kafka-test-fixtures.js";

const createFixture = () => {
	const storage = createStoreFixture();
	const events: string[] = [];
	let end = 5n;
	let failPrepare = false;
	const createFollower = (name: string): PartitionOutcomeFollowerPort => ({
		readLogRange: async () => {
			events.push(`${name}:range:${end}`);
			return { logStartOffset: 0n, logEndOffset: end };
		},
		startAndCatchUp: async ({ targetNextOffset }) => {
			events.push(`${name}:replay:${targetNextOffset}`);
			if (failPrepare && name === "prepare") throw new Error("replay failed");
		},
		readProgress: () => ({ consumedNextOffset: null, highWatermark: null }),
		stop: async () => {
			events.push(`${name}:stop`);
		},
	});
	const follower = createFollower("active");
	const runtime = createPartitionRuntime({
		ctx: {
			stateStore: storage.store,
			producer: {
				connect: async () => {
					events.push("connect");
				},
				fence: async () => {
					events.push("fence");
				},
				disconnect: async () => {
					events.push("disconnect");
				},
			},
			appender: { appendCommitted: async () => ({ baseOffset: 0n }) },
			follower,
			bootstrapper: {
				bootstrap: async () => {
					events.push("bootstrap");
					return { kind: "continued", nextOffset: 0n };
				},
			},
			partitionResolver: { partitionForIdentity: () => partition },
			trackReceiptPolicy: { retentionMs: 1_000, now: () => 0 },
		},
		config: {
			topic,
			partition,
			writerLimits: {
				maxBatchSize: 10,
				maxPendingCommands: 10,
				maxPendingCommandsPerCustomer: 10,
			},
			recoveryDrainTimeoutMs: 10,
		},
	});
	return {
		runtime,
		follower,
		events,
		preparation: createFollower("prepare"),
		setEnd: (value: bigint) => {
			end = value;
		},
		fail: () => {
			failPrepare = true;
		},
		cleanup: async () => {
			await runtime.stop();
			closeStoreFixture(storage);
		},
	};
};

describe("runtime preparation", () => {
	test("late preparation failure cannot poison the activated runtime", async () => {
		const fixture = createFixture();
		let unavailable: ((failure: { cause: unknown }) => void) | undefined;
		const follower = {
			...fixture.preparation,
			startAndCatchUp: async (
				params: Parameters<PartitionOutcomeFollowerPort["startAndCatchUp"]>[0],
			) => {
				unavailable = params.onUnavailable;
			},
		};
		try {
			await fixture.runtime.prepare({ follower });
			unavailable?.({ cause: new Error("stale reader callback") });
			await fixture.runtime.activate();
			expect(fixture.runtime.getStatus()).toBe("ready");
		} finally {
			await fixture.cleanup();
		}
	});
	test("stop cancels a pending preparation and waits for reader shutdown", async () => {
		const fixture = createFixture();
		let finishReplay = () => {};
		const replay = new Promise<void>((resolve) => {
			finishReplay = resolve;
		});
		let started = false;
		const follower = {
			...fixture.preparation,
			startAndCatchUp: async () => {
				started = true;
				await replay;
			},
			stop: async () => {
				fixture.events.push("reader-closed");
				finishReplay();
			},
		};
		const preparing = fixture.runtime.prepare({ follower });
		const rejected = preparing.catch((cause: unknown) => cause);
		try {
			await new Promise<void>((resolve) => setImmediate(resolve));
			expect(started).toBe(true);
			await fixture.runtime.stop();
			expect(await rejected).toBeInstanceOf(OwnedPartitionNotReadyError);
			expect(fixture.runtime.getStatus()).toBe("stopped");
			expect(fixture.events).toContain("reader-closed");
			expect(fixture.events).not.toContain("connect");
			await expect(fixture.runtime.activate()).rejects.toThrow();
		} finally {
			finishReplay();
			await fixture.cleanup();
		}
	});

	test("preparation is not complete until cleanup succeeds", async () => {
		const fixture = createFixture();
		let finishCleanup = () => {};
		const cleanup = new Promise<void>((resolve) => {
			finishCleanup = resolve;
		});
		const preparing = fixture.runtime.prepare({
			follower: { ...fixture.preparation, stop: () => cleanup },
		});
		try {
			await new Promise<void>((resolve) => setImmediate(resolve));
			expect(fixture.runtime.getStatus()).toBe("preparing");
			await expect(fixture.runtime.activate()).rejects.toThrow();
			finishCleanup();
			await preparing;
			expect(fixture.runtime.getStatus()).toBe("prepared");
		} finally {
			finishCleanup();
			await fixture.cleanup();
		}
	});

	test("cleanup failure prevents activation", async () => {
		const fixture = createFixture();
		try {
			await expect(
				fixture.runtime.prepare({
					follower: {
						...fixture.preparation,
						stop: async () => {
							throw new Error("reader cleanup failed");
						},
					},
				}),
			).rejects.toThrow("requires recovery");
			expect(fixture.runtime.getStatus()).toBe("recovery_required");
			await expect(fixture.runtime.activate()).rejects.toThrow();
			expect(fixture.events).not.toContain("connect");
		} finally {
			await fixture.cleanup();
		}
	});
	test("prepares without producer authority and closes replay before activation", async () => {
		const f = createFixture();
		try {
			await f.runtime.prepare({ follower: f.preparation });
			expect(f.events).toEqual([
				"prepare:range:5",
				"bootstrap",
				"prepare:replay:5",
				"prepare:stop",
			]);
			expect(f.runtime.getStatus()).toBe("prepared");
			f.setEnd(9n);
			await f.runtime.activate();
			expect(f.events.slice(4)).toEqual([
				"connect",
				"fence",
				"active:range:9",
				"bootstrap",
				"active:replay:9",
			]);
			expect(f.runtime.getStatus()).toBe("ready");
		} finally {
			await f.cleanup();
		}
	});
	test("rejects activation before preparation without touching the producer", async () => {
		const f = createFixture();
		try {
			await expect(f.runtime.activate()).rejects.toBeInstanceOf(
				OwnedPartitionNotReadyError,
			);
			expect(f.events).toEqual([]);
		} finally {
			await f.cleanup();
		}
	});
	test("drains without disposing the producer and refuses activation after drain", async () => {
		const f = createFixture();
		try {
			await f.runtime.start();
			await f.runtime.drain();
			expect(f.runtime.getStatus()).toBe("draining");
			expect(f.events).not.toContain("disconnect");
			await expect(f.runtime.activate()).rejects.toBeInstanceOf(
				OwnedPartitionNotReadyError,
			);
			await f.runtime.stop();
			expect(f.events.at(-1)).toBe("disconnect");
		} finally {
			await f.cleanup();
		}
	});
	test("failed preparation cannot activate and closes its replay source", async () => {
		const f = createFixture();
		try {
			f.fail();
			await expect(
				f.runtime.prepare({ follower: f.preparation }),
			).rejects.toThrow("requires recovery");
			expect(f.events).toContain("prepare:stop");
			expect(f.events).not.toContain("connect");
			await expect(f.runtime.activate()).rejects.toThrow();
		} finally {
			await f.cleanup();
		}
	});
	test("rejects using the active follower as the preparation source", async () => {
		const f = createFixture();
		try {
			await expect(f.runtime.prepare({ follower: f.follower })).rejects.toThrow(
				"separate",
			);
			expect(f.events).toEqual([]);
		} finally {
			await f.cleanup();
		}
	});
});
