import { expect, test } from "bun:test";
import {
	migrationProgressDenominator,
	migrationProgressPercent,
	runProgressLabel,
} from "./migrationProgress";

test("progress label follows the run state", () => {
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
	).toBe("Last run");
});

test("percent is completed over the larger of claimed and expected", () => {
	expect(
		migrationProgressPercent({ completed: 50, total: 60, expected: 100 }),
	).toBe(50);
	expect(
		migrationProgressPercent({ completed: 50, total: 200, expected: 100 }),
	).toBe(25);
});

test("nothing expected reads as zero, never NaN", () => {
	expect(
		migrationProgressPercent({ completed: 0, total: 0, expected: 0 }),
	).toBe(0);
	expect(
		migrationProgressPercent({ completed: 0, total: 0, expected: null }),
	).toBe(0);
});

test("completing everything caps at one hundred", () => {
	expect(
		migrationProgressPercent({ completed: 120, total: 120, expected: 100 }),
	).toBe(100);
	expect(migrationProgressDenominator({ total: 120, expected: 100 })).toBe(120);
	expect(migrationProgressDenominator({ total: 3, expected: null })).toBe(3);
});
