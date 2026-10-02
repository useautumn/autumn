import { describe, expect, test } from "bun:test";
import type { EdgeConfigS3Client } from "@autumn/edge-config";
import { createWorkerEdgeConfigs } from "../../../src/edgeConfig/createWorkerEdgeConfigs.js";
import {
	BALANCE_WORKER_SUBJECT_SNAPSHOTS_KEY,
	defaultSubjectSnapshotsEdgeConfig,
	SubjectSnapshotsEdgeConfigSchema,
} from "../../../src/edgeConfig/subjectSnapshotsEdgeConfig.js";
import { createMemoryS3Client } from "../../fixtures/subjectSnapshotsStore.js";

const workerEdgeConfigsOver = (s3Client: EdgeConfigS3Client) =>
	createWorkerEdgeConfigs({
		ctx: { s3Client },
		config: { location: { bucket: "test", region: "us-east-2" } },
	});

describe("the subject snapshots edge config", () => {
	test("an empty object is off with the documented defaults; a partial object fills the rest in", () => {
		expect(SubjectSnapshotsEdgeConfigSchema.parse({})).toEqual(
			defaultSubjectSnapshotsEdgeConfig(),
		);
		expect(SubjectSnapshotsEdgeConfigSchema.parse({ mode: "write" })).toEqual({
			mode: "write",
			maxBytes: 262_144,
			dropBatch: 500,
		});
	});

	test("a mode without a read path, an unknown key, or a bound out of range is refused whole", () => {
		for (const raw of [
			{ mode: "verify" },
			{ mode: "serve" },
			{ mode: "write", serve: true },
			{ maxBytes: 0 },
			{ dropBatch: 5_001 },
			{ dropBatch: 1.5 },
		])
			expect(SubjectSnapshotsEdgeConfigSchema.safeParse(raw).success).toBe(
				false,
			);
	});

	test("the worker registers it under the admin key and reads a write it finds there", async () => {
		const edgeConfigs = workerEdgeConfigsOver(createMemoryS3Client());
		expect(edgeConfigs.subjectSnapshots.get()).toEqual(
			defaultSubjectSnapshotsEdgeConfig(),
		);

		await edgeConfigs.subjectSnapshots.writeToSource({
			config: { mode: "write", maxBytes: 1_024, dropBatch: 10 },
		});
		await edgeConfigs.subjectSnapshots.refresh();
		expect(edgeConfigs.subjectSnapshots.get()).toEqual({
			mode: "write",
			maxBytes: 1_024,
			dropBatch: 10,
		});
	});

	test("a failed poll after a good read keeps the last record: a writing fleet is not flipped back to off", async () => {
		let failing = false;
		const memory = createMemoryS3Client();
		const edgeConfigs = workerEdgeConfigsOver({
			send: (command) => {
				if (failing) throw new Error("S3 unreachable");
				return memory.send(command);
			},
		});
		await edgeConfigs.subjectSnapshots.writeToSource({
			config: { mode: "write", maxBytes: 262_144, dropBatch: 500 },
		});
		await edgeConfigs.subjectSnapshots.refresh();
		expect(edgeConfigs.subjectSnapshots.get().mode).toBe("write");

		failing = true;
		await edgeConfigs.subjectSnapshots.refresh();
		expect(edgeConfigs.subjectSnapshots.getStatus().healthy).toBe(false);
		expect(edgeConfigs.subjectSnapshots.get().mode).toBe("write");
	});

	test("an object naming a mode without a read path is refused, and the last good record stays", async () => {
		const memory = createMemoryS3Client();
		const edgeConfigs = workerEdgeConfigsOver(memory);
		await edgeConfigs.subjectSnapshots.writeToSource({
			config: { mode: "write", maxBytes: 262_144, dropBatch: 500 },
		});
		await edgeConfigs.subjectSnapshots.refresh();

		await memory.send({
			input: {
				Key: BALANCE_WORKER_SUBJECT_SNAPSHOTS_KEY,
				Body: JSON.stringify({ mode: "serve" }),
			},
		} as never);
		await edgeConfigs.subjectSnapshots.refresh();
		expect(edgeConfigs.subjectSnapshots.getStatus().healthy).toBe(false);
		expect(edgeConfigs.subjectSnapshots.get().mode).toBe("write");
	});
});
