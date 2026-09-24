import { expect, test } from "bun:test";
import { migrationProgress, runProgressLabel } from "./migrationProgress";

test("progress label follows the run state", () => {
	expect(
		runProgressLabel({
			migrationStatus: "waiting",
			activeRun: { dry_run: false },
			blockedBy: "pro-v3",
		}),
	).toBe("Waiting for pro-v3");
	expect(
		runProgressLabel({
			migrationStatus: "waiting",
			activeRun: { dry_run: false },
		}),
	).toBe("Waiting for another migration");
	expect(
		runProgressLabel({
			migrationStatus: "running",
			activeRun: { dry_run: true },
		}),
	).toBe("Dry run in progress");
	expect(
		runProgressLabel({
			migrationStatus: "running",
			activeRun: { dry_run: false },
		}),
	).toBe("Migrating customers");
	expect(
		runProgressLabel({ migrationStatus: "run", activeRun: undefined }),
	).toBe("Run complete");
});

test("a finished run that changed nothing says so", () => {
	expect(
		runProgressLabel({
			migrationStatus: "run",
			activeRun: undefined,
			lastRunStatus: "no_changes",
		}),
	).toBe("Run complete, no changes");
	expect(
		runProgressLabel({
			migrationStatus: "run",
			activeRun: undefined,
			lastRunStatus: "succeeded",
		}),
	).toBe("Run complete");
});

test("percent is completed over the larger of claimed and expected", () => {
	expect(
		migrationProgress({ completed: 50, total: 60, expected: 100 }),
	).toEqual({ percent: 50, denominator: 100 });
	expect(
		migrationProgress({ completed: 50, total: 200, expected: 100 }),
	).toEqual({ percent: 25, denominator: 200 });
});

test("nothing expected reads as zero, never NaN", () => {
	expect(
		migrationProgress({ completed: 0, total: 0, expected: 0 }).percent,
	).toBe(0);
	expect(
		migrationProgress({ completed: 0, total: 0, expected: null }).percent,
	).toBe(0);
});

test("completing everything caps at one hundred", () => {
	expect(
		migrationProgress({ completed: 120, total: 120, expected: 100 }).percent,
	).toBe(100);
});

test("an unknown scope stays indeterminate instead of reading complete", () => {
	expect(
		migrationProgress({ completed: 205_000, total: 205_000, expected: null }),
	).toEqual({ percent: 0, denominator: null });
});
