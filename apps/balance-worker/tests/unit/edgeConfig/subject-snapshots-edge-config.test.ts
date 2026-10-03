import { describe, expect, test } from "bun:test";
import {
	defaultSubjectSnapshotsEdgeConfig,
	SubjectSnapshotsEdgeConfigSchema,
} from "../../../src/edgeConfig/subjectSnapshotsEdgeConfig.js";

describe("subject snapshots edge config", () => {
	test("an empty object is the default: off, the shipped cap and batch", () => {
		expect(SubjectSnapshotsEdgeConfigSchema.parse({})).toEqual(
			defaultSubjectSnapshotsEdgeConfig(),
		);
		expect(defaultSubjectSnapshotsEdgeConfig().mode).toBe("off");
	});

	test("write is a mode; the cap and the batch move independently", () => {
		expect(
			SubjectSnapshotsEdgeConfigSchema.parse({ mode: "write", maxBytes: 1 }),
		).toEqual({ mode: "write", maxBytes: 1, dropBatch: 500 });
	});

	test.each(["verify", "serve", "sometimes"])(
		"%s is refused whole: nothing reads the snapshot yet, so the object keeps its last value",
		(mode) => {
			expect(SubjectSnapshotsEdgeConfigSchema.safeParse({ mode }).success).toBe(
				false,
			);
		},
	);

	test("an unknown key or an unbounded batch is refused", () => {
		expect(
			SubjectSnapshotsEdgeConfigSchema.safeParse({ version: 2 }).success,
		).toBe(false);
		expect(
			SubjectSnapshotsEdgeConfigSchema.safeParse({ dropBatch: 10_000 }).success,
		).toBe(false);
	});
});
