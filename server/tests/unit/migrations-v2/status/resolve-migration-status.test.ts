/**
 * draft   → no Run All (live, unscoped run) has ever started
 * waiting → a Run All is queued behind another migration's running run
 * running → a Run All is queued/running and not blocked
 * run     → the latest Run All succeeded
 * failed  → the latest Run All failed after starting
 * canceled→ the latest Run All was canceled after starting
 */

import { describe, expect, test } from "bun:test";
import type { MigrationRun } from "@autumn/shared";
import { resolveMigrationStatus } from "@/internal/migrations/v2/actions/migrationStatus/resolveMigrationStatus.js";

const MIGRATION_ID = "mig_self";
const OTHER_MIGRATION_ID = "mig_other";

const run = (overrides: Partial<MigrationRun>): MigrationRun => ({
	internal_id: `mrun_${Math.random().toString(36).slice(2, 8)}`,
	migration_internal_id: MIGRATION_ID,
	org_id: "org",
	env: "sandbox",
	status: "succeeded",
	dry_run: false,
	lazy_run: false,
	trigger_run_id: null,
	error_message: null,
	only_ids: null,
	target_limit: null,
	created_at: 1,
	updated_at: null,
	started_at: 2,
	finished_at: 3,
	...overrides,
});

const resolve = ({
	runs,
	orgActiveRuns = [],
}: {
	runs: MigrationRun[];
	orgActiveRuns?: MigrationRun[];
}) =>
	resolveMigrationStatus({
		migrationInternalId: MIGRATION_ID,
		runs,
		orgActiveRuns,
	});

describe("resolveMigrationStatus: draft", () => {
	test("no runs", () => {
		expect(resolve({ runs: [] })).toEqual({
			status: "draft",
			blockedByMigrationInternalId: null,
		});
	});

	test("dry runs never change status", () => {
		expect(
			resolve({ runs: [run({ dry_run: true, status: "running" })] }).status,
		).toBe("draft");
	});

	test("single-customer runs (only_ids) never change status", () => {
		expect(resolve({ runs: [run({ only_ids: ["cus_1"] })] }).status).toBe(
			"draft",
		);
	});

	test("run sample (target_limit) never changes status", () => {
		expect(resolve({ runs: [run({ target_limit: 5 })] }).status).toBe("draft");
	});

	test("a Run All canceled before it started stays draft", () => {
		expect(
			resolve({
				runs: [run({ status: "canceled", started_at: null })],
			}).status,
		).toBe("draft");
	});

	test("a Run All that failed at dispatch stays draft", () => {
		expect(
			resolve({ runs: [run({ status: "failed", started_at: null })] }).status,
		).toBe("draft");
	});
});

describe("resolveMigrationStatus: running", () => {
	test("queued Run All with no blocker", () => {
		expect(
			resolve({ runs: [run({ status: "queued", started_at: null })] }),
		).toEqual({ status: "running", blockedByMigrationInternalId: null });
	});

	test("running Run All", () => {
		expect(
			resolve({ runs: [run({ status: "running", finished_at: null })] }).status,
		).toBe("running");
	});

	test("lazy unscoped run counts as a Run All", () => {
		expect(
			resolve({
				runs: [run({ lazy_run: true, status: "running", finished_at: null })],
			}).status,
		).toBe("running");
	});

	test("run + a new active Run All shows as running again", () => {
		expect(
			resolve({
				runs: [
					run({ status: "succeeded" }),
					run({ status: "queued", started_at: null }),
				],
			}).status,
		).toBe("running");
	});

	test("a queued Run All whose own migration is executing is running, not waiting", () => {
		const executing = run({ status: "running", finished_at: null });
		expect(
			resolve({
				runs: [run({ status: "queued", started_at: null })],
				orgActiveRuns: [executing],
			}).status,
		).toBe("running");
	});

	test("a dry run on another migration does not block", () => {
		const dryBlocker = run({
			migration_internal_id: OTHER_MIGRATION_ID,
			dry_run: true,
			status: "running",
		});
		expect(
			resolve({
				runs: [run({ status: "queued", started_at: null })],
				orgActiveRuns: [dryBlocker],
			}).status,
		).toBe("running");
	});

	test("another migration merely queued does not block", () => {
		const queuedOther = run({
			migration_internal_id: OTHER_MIGRATION_ID,
			status: "queued",
			started_at: null,
		});
		expect(
			resolve({
				runs: [run({ status: "queued", started_at: null })],
				orgActiveRuns: [queuedOther],
			}).status,
		).toBe("running");
	});
});

describe("resolveMigrationStatus: waiting", () => {
	test("queued Run All behind another migration's running live run", () => {
		const blocker = run({
			internal_id: "mrun_blocker",
			migration_internal_id: OTHER_MIGRATION_ID,
			status: "running",
			finished_at: null,
		});
		expect(
			resolve({
				runs: [run({ status: "queued", started_at: null })],
				orgActiveRuns: [blocker],
			}),
		).toEqual({
			status: "waiting",
			blockedByMigrationInternalId: OTHER_MIGRATION_ID,
		});
	});

	test("an executing Run All is never waiting even if another migration is running", () => {
		const blocker = run({
			migration_internal_id: OTHER_MIGRATION_ID,
			status: "running",
			finished_at: null,
		});
		expect(
			resolve({
				runs: [run({ status: "running", finished_at: null })],
				orgActiveRuns: [blocker],
			}).status,
		).toBe("running");
	});
});

describe("resolveMigrationStatus: run", () => {
	test("succeeded Run All", () => {
		expect(resolve({ runs: [run({ status: "succeeded" })] })).toEqual({
			status: "run",
			blockedByMigrationInternalId: null,
		});
	});

	test("pre-aggregated history counts as run without the finished rows", () => {
		expect(
			resolveMigrationStatus({
				migrationInternalId: MIGRATION_ID,
				runs: [],
				orgActiveRuns: [],
				latestRunAllStatus: "succeeded",
			}).status,
		).toBe("run");
	});

	test("scoped runs after a Run All do not change run", () => {
		expect(
			resolve({
				runs: [
					run({ status: "succeeded" }),
					run({ only_ids: ["cus_1"], status: "running", finished_at: null }),
					run({ dry_run: true, status: "queued", started_at: null }),
				],
			}).status,
		).toBe("run");
	});
});

describe("resolveMigrationStatus: no_changes", () => {
	test("the latest Run All changed nothing", () => {
		expect(resolve({ runs: [run({ status: "no_changes" })] })).toEqual({
			status: "no_changes",
			blockedByMigrationInternalId: null,
		});
	});

	test("a later Run All that did change something wins", () => {
		expect(
			resolve({
				runs: [
					run({ status: "no_changes", created_at: 1 }),
					run({ status: "succeeded", created_at: 2 }),
				],
			}).status,
		).toBe("run");
	});

	test("a later no-op Run All supersedes an earlier real one", () => {
		expect(
			resolve({
				runs: [
					run({ status: "succeeded", created_at: 1 }),
					run({ status: "no_changes", created_at: 2 }),
				],
			}).status,
		).toBe("no_changes");
	});

	test("scoped and dry runs never decide it", () => {
		expect(
			resolve({
				runs: [
					run({ status: "no_changes", created_at: 1 }),
					run({ only_ids: ["cus_1"], status: "succeeded", created_at: 2 }),
					run({ dry_run: true, status: "succeeded", created_at: 3 }),
				],
			}).status,
		).toBe("no_changes");
	});

	test("an active Run All outranks the last outcome", () => {
		expect(
			resolve({
				runs: [
					run({ status: "no_changes", created_at: 1 }),
					run({ status: "running", created_at: 2, finished_at: null }),
				],
			}).status,
		).toBe("running");
	});

	test("pre-aggregated history without run rows stays run", () => {
		expect(
			resolveMigrationStatus({
				migrationInternalId: MIGRATION_ID,
				runs: [],
				orgActiveRuns: [],
				latestRunAllStatus: "succeeded",
			}).status,
		).toBe("run");
	});

	/** The list endpoint passes only active runs, so a finished no-op run
	 * reaches the resolver through this aggregate rather than in `runs`. */
	test("pre-aggregated no_changes without run rows reads no_changes", () => {
		expect(
			resolveMigrationStatus({
				migrationInternalId: MIGRATION_ID,
				runs: [],
				orgActiveRuns: [],
				latestRunAllStatus: "no_changes",
			}).status,
		).toBe("no_changes");
	});
});

describe("resolveMigrationStatus: failed and canceled", () => {
	test("a failed Run All reads failed, not run", () => {
		expect(resolve({ runs: [run({ status: "failed" })] })).toEqual({
			status: "failed",
			blockedByMigrationInternalId: null,
		});
	});

	test("a canceled Run All reads canceled, not run", () => {
		expect(resolve({ runs: [run({ status: "canceled" })] }).status).toBe(
			"canceled",
		);
	});

	test("a later successful run supersedes an earlier failure", () => {
		expect(
			resolve({
				runs: [
					run({ status: "failed", created_at: 1 }),
					run({ status: "succeeded", created_at: 2 }),
				],
			}).status,
		).toBe("run");
	});

	test("a later failure supersedes an earlier success", () => {
		expect(
			resolve({
				runs: [
					run({ status: "succeeded", created_at: 1 }),
					run({ status: "failed", created_at: 2 }),
				],
			}).status,
		).toBe("failed");
	});

	test("pre-aggregated failed history reads failed", () => {
		expect(
			resolveMigrationStatus({
				migrationInternalId: MIGRATION_ID,
				runs: [],
				orgActiveRuns: [],
				latestRunAllStatus: "failed",
			}).status,
		).toBe("failed");
	});
});
