import type { MigrationStatus } from "@autumn/shared";

export function runProgressLabel({
	migrationStatus,
	activeRun,
	blockedBy = null,
}: {
	migrationStatus: MigrationStatus;
	activeRun: { dry_run: boolean } | undefined;
	blockedBy?: string | null;
}): string {
	if (migrationStatus === "waiting")
		return `Waiting for ${blockedBy ?? "another migration"}`;
	if (!activeRun) return "Last run";
	return activeRun.dry_run ? "Dry run in progress" : "Migrating customers";
}

/** Claims land page by page, so `total` grows mid-run; the expected scope
 * (the filter count) keeps the bar from lurching backwards. */
export function migrationProgress({
	completed,
	total,
	expected,
}: {
	completed: number;
	total: number;
	expected: number | null;
}): { percent: number; denominator: number } {
	const denominator = Math.max(total, expected ?? 0);
	if (denominator <= 0) return { percent: 0, denominator: 0 };
	return {
		percent: Math.min(100, Math.round((completed / denominator) * 100)),
		denominator,
	};
}
