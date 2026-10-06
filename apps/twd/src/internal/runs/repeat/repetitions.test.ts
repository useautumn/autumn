import { describe, expect, test } from "bun:test";
import {
	CreateRunBody,
	MAX_REPEAT,
	type RunFile,
} from "../../../api/contract.ts";
import { TwdError } from "../../../http/apiError.ts";
import {
	MAX_REPEAT_WORK_ITEMS,
	planWorkItems,
	splitRepetitionId,
	summariseRepeats,
	toRepetitionId,
} from "./repetitions.ts";

const body = { branch: "feat/x", selection: { files: ["a.test.ts"] } };

const file = (overrides: Partial<RunFile> & { file: string }): RunFile => ({
	status: "passed",
	durationMs: 1_000,
	attempt: 1,
	passedTests: 1,
	failedTests: 0,
	worker: "w1",
	failureSummary: null,
	...overrides,
});

describe("CreateRunBody.repeat", () => {
	test("defaults to 1", () => {
		expect(CreateRunBody.parse(body).repeat).toBe(1);
	});

	test("accepts 1 through MAX_REPEAT", () => {
		expect(CreateRunBody.parse({ ...body, repeat: 1 }).repeat).toBe(1);
		expect(CreateRunBody.parse({ ...body, repeat: MAX_REPEAT }).repeat).toBe(
			MAX_REPEAT,
		);
	});

	test("rejects 0, non-integers and anything above the cap", () => {
		for (const repeat of [0, -1, 2.5, MAX_REPEAT + 1])
			expect(CreateRunBody.safeParse({ ...body, repeat }).success).toBe(false);
	});

	test("baseline runs cannot repeat", () => {
		expect(
			CreateRunBody.safeParse({ ...body, purpose: "baseline", repeat: 3 })
				.success,
		).toBe(false);
		expect(
			CreateRunBody.safeParse({ ...body, purpose: "baseline", repeat: 1 })
				.success,
		).toBe(true);
	});
});

describe("planWorkItems", () => {
	test("repeat=1 keeps the plain file ids", () => {
		expect(
			planWorkItems({ files: ["a.test.ts", "b.test.ts"], repeat: 1 }),
		).toEqual(["a.test.ts", "b.test.ts"]);
	});

	test("repeat=N expands each file into N independent work items", () => {
		expect(
			planWorkItems({ files: ["a.test.ts", "b.test.ts"], repeat: 3 }),
		).toEqual([
			"a.test.ts#1",
			"a.test.ts#2",
			"a.test.ts#3",
			"b.test.ts#1",
			"b.test.ts#2",
			"b.test.ts#3",
		]);
	});

	test("refuses a repeat run larger than the work-item budget", () => {
		const files = Array.from({ length: 11 }, (_, i) => `f${i}.test.ts`);
		expect(files.length * 20).toBeGreaterThan(MAX_REPEAT_WORK_ITEMS);
		expect(() => planWorkItems({ files, repeat: 20 })).toThrow(TwdError);
		expect(
			planWorkItems({ files: files.slice(0, 10), repeat: 20 }),
		).toHaveLength(200);
	});

	test("the budget never applies to normal runs", () => {
		const files = Array.from({ length: 1_000 }, (_, i) => `f${i}.test.ts`);
		expect(planWorkItems({ files, repeat: 1 })).toHaveLength(1_000);
	});
});

describe("repetition ids", () => {
	test("round-trip", () => {
		const id = toRepetitionId({ file: "integration/a.test.ts", repetition: 7 });
		expect(id).toBe("integration/a.test.ts#7");
		expect(splitRepetitionId({ id })).toEqual({
			file: "integration/a.test.ts",
			repetition: 7,
		});
	});

	test("plain ids and absolute paths split cleanly", () => {
		expect(splitRepetitionId({ id: "integration/a.test.ts" })).toEqual({
			file: "integration/a.test.ts",
			repetition: null,
		});
		expect(splitRepetitionId({ id: "/repo/server/tests/a.test.ts#2" })).toEqual(
			{ file: "/repo/server/tests/a.test.ts", repetition: 2 },
		);
	});
});

describe("summariseRepeats", () => {
	test("a timed-out repetition counts as failed", () => {
		const [stat] = summariseRepeats({
			files: [
				file({ file: "a.test.ts#1" }),
				file({ file: "a.test.ts#2", status: "timed_out", attempt: 2 }),
			],
		});
		expect(stat?.failed).toBe(1);
		expect(stat?.done).toBe(2);
	});

	test("counts first-attempt passes per file as X/N", () => {
		const stats = summariseRepeats({
			files: [
				file({ file: "a.test.ts#1" }),
				file({ file: "a.test.ts#2", attempt: 2 }),
				file({ file: "a.test.ts#3", status: "failed", attempt: 2 }),
				file({ file: "a.test.ts#4", status: "crashed", attempt: 2 }),
				file({ file: "b.test.ts#1" }),
				file({ file: "b.test.ts#2", status: "running", durationMs: null }),
				file({ file: "b.test.ts#3", status: "queued", durationMs: null }),
			],
		});
		expect(stats).toEqual([
			{
				file: "a.test.ts",
				total: 4,
				done: 4,
				firstAttemptPassed: 1,
				passedOnRetry: 1,
				failed: 2,
			},
			{
				file: "b.test.ts",
				total: 3,
				done: 1,
				firstAttemptPassed: 1,
				passedOnRetry: 0,
				failed: 0,
			},
		]);
	});

	test("ignores files that are not repetitions", () => {
		expect(summariseRepeats({ files: [file({ file: "a.test.ts" })] })).toEqual(
			[],
		);
	});
});
