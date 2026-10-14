import { describe, expect, test } from "bun:test";
import { MigrationRunStatus } from "@autumn/shared";
import { resolveRunOutcomeStatus } from "@/internal/migrations/v2/actions/migrationRun/resolveRunOutcomeStatus.js";

const counts = ({
	succeeded = 0,
	skipped = 0,
	failed = 0,
}: {
	succeeded?: number;
	skipped?: number;
	failed?: number;
}) => ({ succeeded, skipped, failed });

describe("resolveRunOutcomeStatus: no_changes", () => {
	test("every item skipped", () => {
		expect(resolveRunOutcomeStatus(counts({ skipped: 40 }))).toBe(
			MigrationRunStatus.NoChanges,
		);
	});

	test("a single skipped item and nothing else", () => {
		expect(resolveRunOutcomeStatus(counts({ skipped: 1 }))).toBe(
			MigrationRunStatus.NoChanges,
		);
	});
});

describe("resolveRunOutcomeStatus: succeeded", () => {
	test("all items succeeded", () => {
		expect(resolveRunOutcomeStatus(counts({ succeeded: 12 }))).toBe(
			MigrationRunStatus.Succeeded,
		);
	});

	test("one real change among many skips still counts as a migration", () => {
		expect(resolveRunOutcomeStatus(counts({ succeeded: 1, skipped: 99 }))).toBe(
			MigrationRunStatus.Succeeded,
		);
	});

	test("a run that claimed no items at all is not a no-op run", () => {
		expect(resolveRunOutcomeStatus(counts({}))).toBe(
			MigrationRunStatus.Succeeded,
		);
	});
});

describe("resolveRunOutcomeStatus: failures dominate", () => {
	test("skips alongside a failure are not reported as no_changes", () => {
		expect(resolveRunOutcomeStatus(counts({ skipped: 5, failed: 1 }))).toBe(
			MigrationRunStatus.Succeeded,
		);
	});
});
