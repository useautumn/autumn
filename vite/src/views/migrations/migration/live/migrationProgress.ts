import type { MigrationRunStatus, MigrationStatus } from "@autumn/shared";

export function runProgressLabel({
	migrationStatus,
	activeRun,
	blockedBy = null,
	lastRunStatus,
}: {
	migrationStatus: MigrationStatus;
	activeRun: { dry_run: boolean } | undefined;
	blockedBy?: string | null;
	lastRunStatus?: MigrationRunStatus | null;
}): string {
	if (migrationStatus === "waiting")
		return `Waiting for ${blockedBy ?? "another migration"}`;
	if (!activeRun)
		return lastRunStatus === "no_changes"
			? "Run complete, no changes"
			: "Run complete";
	return activeRun.dry_run ? "Dry run in progress" : "Migrating customers";
}

/** Claims land page by page, so `total` grows mid-run; the expected scope
 * (the filter count) keeps the bar from lurching backwards. Until that count
 * loads the scope is unknown, so the bar stays indeterminate rather than
 * reading complete against the customers claimed so far. */
export function migrationProgress({
	completed,
	total,
	expected,
}: {
	completed: number;
	total: number;
	expected: number | null;
}): { percent: number; denominator: number | null } {
	if (expected === null) return { percent: 0, denominator: null };
	const denominator = Math.max(total, expected);
	if (denominator <= 0) return { percent: 0, denominator: 0 };
	return {
		percent: Math.min(100, Math.round((completed / denominator) * 100)),
		denominator,
	};
}
