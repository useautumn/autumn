import { expect, test } from "bun:test";
import type { RunFile } from "../../../api/contract.ts";
import {
	classifyFailure,
	failsEveryDevRun,
	triageFiles,
} from "./classifyFailure.ts";
import { skipsKnownRedRetries } from "./selectNoRetryFiles.ts";

const runFile = (overrides: Partial<RunFile> & { file: string }): RunFile => ({
	status: "failed",
	durationMs: 1_000,
	attempt: 2,
	passedTests: 0,
	failedTests: 1,
	worker: "w1",
	failureSummary: null,
	...overrides,
});

test("a failure is new when dev passes it at least 90% of the time", () => {
	expect(classifyFailure({ baseline: { passRate: 0.9, samples: 10 } })).toBe(
		"new_failure",
	);
	expect(classifyFailure({ baseline: { passRate: 1, samples: 8 } })).toBe(
		"new_failure",
	);
});

test("a failure is pre-existing when dev passes it at most 10% of the time", () => {
	expect(classifyFailure({ baseline: { passRate: 0, samples: 8 } })).toBe(
		"fails_on_dev",
	);
	expect(classifyFailure({ baseline: { passRate: 0.1, samples: 10 } })).toBe(
		"fails_on_dev",
	);
});

test("a failure between the two thresholds is flaky on dev", () => {
	expect(classifyFailure({ baseline: { passRate: 0.875, samples: 8 } })).toBe(
		"flaky_on_dev",
	);
	expect(classifyFailure({ baseline: { passRate: 0.2, samples: 10 } })).toBe(
		"flaky_on_dev",
	);
});

test("a file with no dev baseline has no dev history", () => {
	expect(classifyFailure({ baseline: undefined })).toBe("no_dev_history");
});

test("only a file failing every one of at least 3 dev runs is known red", () => {
	expect(failsEveryDevRun({ passRate: 0, samples: 3 })).toBe(true);
	expect(failsEveryDevRun({ passRate: 0, samples: 2 })).toBe(false);
	expect(failsEveryDevRun({ passRate: 0.1, samples: 10 })).toBe(false);
});

test("known-red retries are skipped only for plain non-baseline runs unless configured", () => {
	const branchRun = { isBaseline: false, repeat: 1, retryFailsOnDev: false };
	expect(skipsKnownRedRetries(branchRun)).toBe(true);
	expect(skipsKnownRedRetries({ ...branchRun, retryFailsOnDev: true })).toBe(
		false,
	);
	expect(skipsKnownRedRetries({ ...branchRun, isBaseline: true })).toBe(false);
	expect(skipsKnownRedRetries({ ...branchRun, repeat: 5 })).toBe(false);
});

test("triage covers final failures and retrying files, new failures first, with a summary line", () => {
	const baselines = new Map([
		["a-flaky.test.ts", { passRate: 0.75, samples: 8 }],
		["b-red.test.ts", { passRate: 0, samples: 8 }],
		["c-new.test.ts", { passRate: 1, samples: 8 }],
		["d-new-retrying.test.ts", { passRate: 0.95, samples: 8 }],
		["e-passed.test.ts", { passRate: 1, samples: 8 }],
	]);
	const triage = triageFiles({
		files: [
			runFile({ file: "a-flaky.test.ts" }),
			runFile({ file: "b-red.test.ts", status: "crashed", attempt: 1 }),
			runFile({ file: "c-new.test.ts" }),
			runFile({ file: "d-new-retrying.test.ts", status: "running" }),
			runFile({ file: "e-passed.test.ts", status: "passed" }),
			runFile({ file: "f-unknown.test.ts", status: "timed_out" }),
			runFile({ file: "g-running.test.ts", status: "running", attempt: 1 }),
		],
		baselines,
	});

	expect(triage.summary).toBe(
		"4 failed: 1 new, 1 flaky on dev, 1 fail on dev, 1 no history; 1 retrying after a failed first attempt: 1 new, 0 flaky on dev, 0 fail on dev, 0 no history",
	);
	expect(triage.failures).toEqual([
		{
			file: "c-new.test.ts",
			kind: "new_failure",
			devPassRate: 1,
			devSamples: 8,
			retrying: false,
		},
		{
			file: "d-new-retrying.test.ts",
			kind: "new_failure",
			devPassRate: 0.95,
			devSamples: 8,
			retrying: true,
		},
		{
			file: "a-flaky.test.ts",
			kind: "flaky_on_dev",
			devPassRate: 0.75,
			devSamples: 8,
			retrying: false,
		},
		{
			file: "b-red.test.ts",
			kind: "fails_on_dev",
			devPassRate: 0,
			devSamples: 8,
			retrying: false,
		},
		{
			file: "f-unknown.test.ts",
			kind: "no_dev_history",
			devPassRate: null,
			devSamples: 0,
			retrying: false,
		},
	]);
});

test("a run with no failures summarises as 0 failed", () => {
	expect(
		triageFiles({
			files: [runFile({ file: "a.test.ts", status: "passed" })],
			baselines: new Map(),
		}),
	).toEqual({ summary: "0 failed", failures: [] });
});
