import type { MigrationStatus } from "@autumn/shared";

const PERCENT_MAX = 100;

export function runProgressLabel({
	migrationStatus,
	activeRun,
}: {
	migrationStatus: MigrationStatus;
	activeRun: { dry_run: boolean } | undefined;
}): string {
	if (migrationStatus === "waiting") return "Waiting for another migration";
	if (!activeRun) return "Last run";
	return activeRun.dry_run ? "Dry run in progress" : "Migrating customers";
}

/** Claims land page by page, so `total` grows during a run; the expected
 * scope (the filter count) keeps the bar from lurching backwards. */
export function migrationProgressPercent({
	completed,
	total,
	expected,
}: {
	completed: number;
	total: number;
	expected: number | null;
}): number {
	const denominator = Math.max(total, expected ?? 0);
	if (denominator <= 0) return 0;
	return Math.min(
		PERCENT_MAX,
		Math.round((completed / denominator) * PERCENT_MAX),
	);
}

export function migrationProgressDenominator({
	total,
	expected,
}: {
	total: number;
	expected: number | null;
}): number {
	return Math.max(total, expected ?? 0);
}
