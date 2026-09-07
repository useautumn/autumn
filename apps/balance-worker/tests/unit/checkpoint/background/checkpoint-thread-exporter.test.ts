import { describe, expect, test } from "bun:test";
import { Worker } from "node:worker_threads";
import { PartitionCheckpointThreadError } from "../../../../src/checkpoint/background/checkpointThreadFailure.js";
import { createCheckpointThreadExporter } from "../../../../src/checkpoint/background/createCheckpointThreadExporter.js";
import { parsePartitionCheckpoint } from "../../../../src/checkpoint/partitionCheckpoint.js";
import {
	createThreadFixture,
	identity,
	limits,
	releaseGate,
	topic,
	waitForGate,
} from "./thread-fixtures.js";

describe("background checkpoint exporter", () => {
	test.concurrent(
		"rejects worker startup failure instead of hanging the scheduler",
		async () => {
			const exporter = createCheckpointThreadExporter({
				createWorker: () =>
					new Worker(new URL("./missing-thread.ts", import.meta.url)),
			});
			try {
				await expect(
					exporter.export({
						topic,
						partition: 0,
						signal: new AbortController().signal,
					}),
				).rejects.toBeInstanceOf(PartitionCheckpointThreadError);
			} finally {
				await exporter.close();
			}
		},
	);

	test.concurrent(
		"does not carry a revoked cursor into a replacement partition's snapshot",
		async () => {
			const fixture = createThreadFixture({ pauseAt: "before_read" });
			try {
				const restored = parsePartitionCheckpoint({
					input: fixture.store.capturePartitionCheckpoint({
						topic,
						partition: 0,
						createdAt: Date.now(),
						limits,
					}).serialized,
				});
				fixture.applyTrack({ offset: 40n });
				const controller = new AbortController();
				const oldExport = fixture.exporter.export({
					topic,
					partition: 0,
					consumedNextOffset: 42n,
					signal: controller.signal,
				});
				await waitForGate(fixture.gate);
				controller.abort(new Error("old assignment revoked"));
				fixture.store.restorePartitionCheckpoint({
					checkpoint: restored,
					mode: "replace",
					limits,
					partitionResolver: { partitionForIdentity: () => 0 },
				});
				releaseGate(fixture.gate);
				await expect(oldExport).rejects.toThrow("revoked");
				expect(await Bun.file(fixture.outputPath).exists()).toBe(false);
				const replacement = fixture.exporter.export({
					topic,
					partition: 0,
					consumedNextOffset: 2n,
					signal: new AbortController().signal,
				});
				await waitForGate(fixture.gate);
				releaseGate(fixture.gate);
				expect(await replacement).toMatchObject({
					nextOffset: 2n,
					receiptCount: 0,
				});
				expect((await fixture.readCheckpoint()).states[0]?.state.revision).toBe(
					0,
				);
				expect(fixture.starts()).toBe(2);
			} finally {
				await fixture.close();
			}
		},
	);

	test.concurrent(
		"keeps one read cut while the serving connection commits a track",
		async () => {
			const fixture = createThreadFixture({ pauseAt: "after_read" });
			try {
				fixture.applyTrack({ offset: 1n, commandId: "before" });
				const exporting = fixture.exporter.export({
					topic,
					partition: 0,
					consumedNextOffset: 3n,
					signal: new AbortController().signal,
				});
				await waitForGate(fixture.gate);
				fixture.applyTrack({ offset: 3n, commandId: "after" });
				expect(fixture.store.readState({ identity })?.revision).toBe(2);
				releaseGate(fixture.gate);
				const result = await exporting;
				expect(result).toMatchObject({
					nextOffset: 3n,
					stateCount: 1,
					receiptCount: 1,
				});
				expect(result).not.toHaveProperty("serialized");
				expect(result).not.toHaveProperty("states");
				const checkpoint = await fixture.readCheckpoint();
				expect(checkpoint).toMatchObject({
					nextOffset: 3n,
					states: [{ state: { revision: 1 } }],
					receipts: [{ recordOffset: 1n, outcome: { commandId: "before" } }],
				});
				expect(fixture.store.readNextOffset({ topic, partition: 0 })).toBe(4n);
			} finally {
				await fixture.close();
			}
		},
	);

	test.concurrent(
		"includes commits completed before the background read starts",
		async () => {
			const fixture = createThreadFixture({ pauseAt: "before_read" });
			try {
				const exporting = fixture.exporter.export({
					topic,
					partition: 0,
					consumedNextOffset: 2n,
					signal: new AbortController().signal,
				});
				await waitForGate(fixture.gate);
				fixture.applyTrack({ offset: 2n });
				releaseGate(fixture.gate);
				expect(await exporting).toMatchObject({
					nextOffset: 3n,
					receiptCount: 1,
				});
				expect((await fixture.readCheckpoint()).states[0]?.state.revision).toBe(
					1,
				);
			} finally {
				await fixture.close();
			}
		},
	);

	test.concurrent(
		"reuses its thread across partitions and rejects overlapping jobs",
		async () => {
			const fixture = createThreadFixture({ pauseAt: "after_read" });
			try {
				const first = fixture.exporter.export({
					topic,
					partition: 0,
					signal: new AbortController().signal,
				});
				await waitForGate(fixture.gate);
				await expect(
					fixture.exporter.export({
						topic,
						partition: 0,
						signal: new AbortController().signal,
					}),
				).rejects.toThrow("busy");
				releaseGate(fixture.gate);
				const result = await first;
				fixture.store.initializePartition({
					topic,
					partition: 1,
					nextOffset: 40n,
				});
				const second = fixture.exporter.export({
					topic,
					partition: 1,
					signal: new AbortController().signal,
				});
				await waitForGate(fixture.gate);
				releaseGate(fixture.gate);
				expect(await second).toMatchObject({
					nextOffset: 40n,
					etag: result.kind === "published" ? result.etag : "",
				});
				expect(fixture.starts()).toBe(1);
			} finally {
				await fixture.close();
			}
		},
	);

	test.concurrent.each(["after_read", "before_publish"] as const)(
		"cancels a blocked %s job without publishing stale ownership",
		async (pauseAt) => {
			const fixture = createThreadFixture({ pauseAt });
			try {
				const controller = new AbortController();
				const exporting = fixture.exporter.export({
					topic,
					partition: 0,
					signal: controller.signal,
				});
				await waitForGate(fixture.gate);
				const reason = new Error("assignment revoked");
				controller.abort(reason);
				releaseGate(fixture.gate);
				await expect(exporting).rejects.toBe(reason);
				expect(await Bun.file(fixture.outputPath).exists()).toBe(false);
				fixture.applyTrack({ offset: 1n });
				expect(fixture.store.readState({ identity })?.revision).toBe(1);
			} finally {
				await fixture.close();
			}
		},
	);

	test.concurrent(
		"restarts a crashed thread on the next export without affecting balances",
		async () => {
			const fixture = createThreadFixture({ exitOnce: true });
			try {
				await expect(
					fixture.exporter.export({
						topic,
						partition: 0,
						signal: new AbortController().signal,
					}),
				).rejects.toBeInstanceOf(PartitionCheckpointThreadError);
				fixture.applyTrack({ offset: 1n });
				expect(
					await fixture.exporter.export({
						topic,
						partition: 0,
						signal: new AbortController().signal,
					}),
				).toMatchObject({ nextOffset: 2n, receiptCount: 1 });
				expect(fixture.starts()).toBe(2);
			} finally {
				await fixture.close();
			}
		},
	);

	test.concurrent(
		"does not start cancelled jobs or accept work after close",
		async () => {
			const fixture = createThreadFixture();
			try {
				const controller = new AbortController();
				controller.abort(new Error("revoked"));
				await expect(
					fixture.exporter.export({
						topic,
						partition: 0,
						signal: controller.signal,
					}),
				).rejects.toThrow("revoked");
				expect(fixture.starts()).toBe(0);
				await fixture.exporter.close();
				await expect(
					fixture.exporter.export({
						topic,
						partition: 0,
						signal: new AbortController().signal,
					}),
				).rejects.toThrow("closed");
			} finally {
				await fixture.close();
			}
		},
	);
});
