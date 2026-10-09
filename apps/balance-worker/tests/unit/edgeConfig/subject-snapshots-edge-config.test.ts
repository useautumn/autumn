import { describe, expect, test } from "bun:test";
import {
	BALANCE_WORKER_SUBJECT_SNAPSHOTS_KEY,
	defaultSubjectSnapshotsEdgeConfig,
	type EdgeConfigS3Client,
	readsSubjectSnapshots,
	type SubjectSnapshotMode,
	SubjectSnapshotsEdgeConfigSchema,
	servesSubjectSnapshots,
	writesSubjectSnapshots,
} from "@autumn/edge-config";
import { createWorkerEdgeConfigs } from "../../../src/edgeConfig/createWorkerEdgeConfigs.js";
import { createMemoryS3Client } from "../../fixtures/subjectSnapshotsStore.js";

const workerEdgeConfigsOver = (s3Client: EdgeConfigS3Client) =>
	createWorkerEdgeConfigs({
		ctx: { s3Client },
		config: {
			location: { bucket: "test", region: "us-east-2" },
			coldStart: false,
		},
	});

describe("the subject snapshots edge config", () => {
	test("an empty object is off with the documented defaults; a partial object fills the rest in", () => {
		expect(SubjectSnapshotsEdgeConfigSchema.parse({})).toEqual(
			defaultSubjectSnapshotsEdgeConfig(),
		);
		expect(SubjectSnapshotsEdgeConfigSchema.parse({ mode: "serve" })).toEqual({
			mode: "serve",
			maxBytes: 262_144,
			dropBatch: 500,
			refreshConcurrency: 50,
			refreshMaxPending: 10_000,
			writtenAfter: 0,
		});
	});

	test("each mode says what it does with the table: write keeps it, verify and serve also read it, serve alone trusts it", () => {
		const of = (mode: SubjectSnapshotMode) => ({
			writes: writesSubjectSnapshots({ mode }),
			reads: readsSubjectSnapshots({ mode }),
			serves: servesSubjectSnapshots({ mode }),
		});
		expect(of("off")).toEqual({ writes: false, reads: false, serves: false });
		expect(of("write")).toEqual({ writes: true, reads: false, serves: false });
		expect(of("verify")).toEqual({ writes: true, reads: true, serves: false });
		expect(of("serve")).toEqual({ writes: true, reads: true, serves: true });
	});

	test("an unknown mode, an unknown key, or a bound out of range is refused whole", () => {
		for (const raw of [
			{ mode: "read" },
			{ mode: "write", serve: true },
			{ maxBytes: 0 },
			{ dropBatch: 5_001 },
			{ refreshConcurrency: 0 },
			{ refreshMaxPending: 1.5 },
			{ dropBatch: 1.5 },
		])
			expect(SubjectSnapshotsEdgeConfigSchema.safeParse(raw).success).toBe(
				false,
			);
	});

	test("the worker registers it under the admin key and reads a write it finds there", async () => {
		const edgeConfigs = workerEdgeConfigsOver(createMemoryS3Client());
		expect(edgeConfigs.subjectSnapshotsConfig.get()).toEqual(
			defaultSubjectSnapshotsEdgeConfig(),
		);

		await edgeConfigs.subjectSnapshotsConfig.writeToSource({
			config: {
				mode: "write",
				maxBytes: 1_024,
				dropBatch: 10,
				refreshConcurrency: 4,
				refreshMaxPending: 100,
				writtenAfter: 1_700_000_000_000,
			},
		});
		await edgeConfigs.subjectSnapshotsConfig.refresh();
		expect(edgeConfigs.subjectSnapshotsConfig.get()).toEqual({
			mode: "write",
			maxBytes: 1_024,
			dropBatch: 10,
			refreshConcurrency: 4,
			refreshMaxPending: 100,
			writtenAfter: 1_700_000_000_000,
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
		await edgeConfigs.subjectSnapshotsConfig.writeToSource({
			config: { ...defaultSubjectSnapshotsEdgeConfig(), mode: "write" },
		});
		await edgeConfigs.subjectSnapshotsConfig.refresh();
		expect(edgeConfigs.subjectSnapshotsConfig.get().mode).toBe("write");

		failing = true;
		await edgeConfigs.subjectSnapshotsConfig.refresh();
		expect(edgeConfigs.subjectSnapshotsConfig.getStatus().healthy).toBe(false);
		expect(edgeConfigs.subjectSnapshotsConfig.get().mode).toBe("write");
	});

	test("an object naming an unknown mode is refused, and the last good record stays", async () => {
		const memory = createMemoryS3Client();
		const edgeConfigs = workerEdgeConfigsOver(memory);
		await edgeConfigs.subjectSnapshotsConfig.writeToSource({
			config: { ...defaultSubjectSnapshotsEdgeConfig(), mode: "write" },
		});
		await edgeConfigs.subjectSnapshotsConfig.refresh();

		await memory.send({
			input: {
				Key: BALANCE_WORKER_SUBJECT_SNAPSHOTS_KEY,
				Body: JSON.stringify({ mode: "read" }),
			},
		} as never);
		await edgeConfigs.subjectSnapshotsConfig.refresh();
		expect(edgeConfigs.subjectSnapshotsConfig.getStatus().healthy).toBe(false);
		expect(edgeConfigs.subjectSnapshotsConfig.get().mode).toBe("write");
	});
});
