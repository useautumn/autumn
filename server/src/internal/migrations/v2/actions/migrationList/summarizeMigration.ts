import {
	type Migration,
	type MigrationListItemCounts,
	type MigrationListSummary,
	type MigrationRun,
	MigrationRunStatus,
} from "@autumn/shared";
import type { MigrationItemRunCountRow } from "../../repos/index.js";
import type { MigrationRunWithKind } from "../../repos/migrationRun/index.js";
import type { MigrationListContext } from "./types/migrationListContext.js";

const tallyCounts = (
	rows: MigrationItemRunCountRow[],
): MigrationListItemCounts => {
	const counts: MigrationListItemCounts = {
		total: 0,
		running: 0,
		succeeded: 0,
		no_updates_needed: 0,
		ineligible: 0,
		failed: 0,
	};
	for (const row of rows) {
		counts.total += row.count;
		if (row.status === "skipped") {
			const bucket =
				row.skip_reason === "no_updates_needed"
					? "no_updates_needed"
					: "ineligible";
			counts[bucket] += row.count;
		} else {
			counts[row.status] += row.count;
		}
	}
	return counts;
};

const runOutcomeActivity = (
	run: MigrationRunWithKind,
): MigrationListSummary["last_activity"] => {
	if (run.status === MigrationRunStatus.Queued)
		return { kind: "queued", at: run.created_at };
	if (run.status === MigrationRunStatus.Running)
		return { kind: "started", at: run.started_at ?? run.created_at };
	const at = run.finished_at ?? run.started_at ?? run.created_at;
	if (run.status === MigrationRunStatus.Failed) return { kind: "failed", at };
	if (run.status === MigrationRunStatus.Canceled)
		return { kind: "canceled", at };
	return { kind: "finished", at };
};

/** Live runs of other migrations that hold or precede this queued Run All. */
const countRunsAhead = ({
	run,
	orgActiveRuns,
}: {
	run: MigrationRunWithKind;
	orgActiveRuns: MigrationRun[];
}): number =>
	orgActiveRuns.filter(
		(active) =>
			!active.dry_run &&
			active.migration_internal_id !== run.migration_internal_id &&
			(active.status === MigrationRunStatus.Running ||
				active.created_at < run.created_at),
	).length;

export const summarizeMigration = ({
	migration,
	listContext: { latestRuns, itemRunCounts, orgActiveRuns, customerCounts },
}: {
	migration: Migration;
	listContext: MigrationListContext;
}): MigrationListSummary => {
	const belongsToMigration = (row: { migration_internal_id: string }) =>
		row.migration_internal_id === migration.internal_id;
	const runs = latestRuns.filter(belongsToMigration);
	const countRows = itemRunCounts.filter(belongsToMigration);
	const runAll = runs.find((run) => run.kind === "run_all");
	const dryRun = runs.find((run) => run.kind === "dry_run");
	const sample = runs.find((run) => run.kind === "sample");
	const countsForRun = (run: MigrationRunWithKind) =>
		tallyCounts(
			countRows.filter((row) =>
				run.kind === "run_all"
					? !row.dry_run
					: row.migration_run_id === run.internal_id,
			),
		);
	const dryCounts = dryRun ? countsForRun(dryRun) : null;

	const activities: MigrationListSummary["last_activity"][] = [
		{ kind: "created", at: migration.created_at },
	];
	if (migration.updated_at && migration.updated_at > migration.created_at)
		activities.push({ kind: "edited", at: migration.updated_at });
	if (runAll) activities.push(runOutcomeActivity(runAll));
	if (dryRun?.finished_at)
		activities.push({ kind: "dry_run", at: dryRun.finished_at });
	if (sample?.finished_at)
		activities.push({ kind: "sample", at: sample.finished_at });

	return {
		customer_count: customerCounts.get(migration.internal_id) ?? null,
		latest_run: runAll
			? {
					status: runAll.status,
					started_at: runAll.started_at,
					finished_at: runAll.finished_at,
					error_message: runAll.error_message,
					counts: countsForRun(runAll),
				}
			: null,
		latest_dry_run:
			dryRun?.finished_at && dryCounts
				? {
						status: dryRun.status,
						finished_at: dryRun.finished_at,
						previewed: dryCounts.total,
						would_change: dryCounts.succeeded,
						would_fail: dryCounts.failed,
					}
				: null,
		latest_sample: sample?.finished_at
			? {
					status: sample.status,
					size: countsForRun(sample).total,
					finished_at: sample.finished_at,
				}
			: null,
		queue_position:
			runAll?.status === MigrationRunStatus.Queued
				? countRunsAhead({ run: runAll, orgActiveRuns })
				: null,
		last_activity: activities.reduce((latest, activity) =>
			activity.at > latest.at ? activity : latest,
		),
	};
};
