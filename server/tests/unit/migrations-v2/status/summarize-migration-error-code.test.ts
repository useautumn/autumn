import { describe, expect, test } from "bun:test";
import {
	type Migration,
	MigrationRunErrorCode,
	type MigrationRunErrorCode as MigrationRunErrorCodeType,
} from "@autumn/shared";
import { summarizeMigration } from "@/internal/migrations/v2/actions/migrationList/summarizeMigration.js";
import type { MigrationListContext } from "@/internal/migrations/v2/actions/migrationList/types/migrationListContext.js";
import type { MigrationRunWithKind } from "@/internal/migrations/v2/repos/migrationRun/index.js";

const MIGRATION_INTERNAL_ID = "mig_internal_1";

const migration = {
	internal_id: MIGRATION_INTERNAL_ID,
	created_at: 1,
	updated_at: null,
} as Migration;

const failedRunAll = ({
	errorMessage,
	errorCode,
}: {
	errorMessage: string | null;
	errorCode: MigrationRunErrorCodeType | null;
}): MigrationRunWithKind => ({
	internal_id: "mrun_1",
	migration_internal_id: MIGRATION_INTERNAL_ID,
	org_id: "org_1",
	env: "sandbox",
	status: "failed",
	dry_run: false,
	lazy_run: false,
	trigger_run_id: null,
	error_message: errorMessage,
	error_code: errorCode,
	only_ids: null,
	target_limit: null,
	created_at: 2,
	updated_at: null,
	started_at: 3,
	finished_at: 4,
	kind: "run_all",
});

const summarize = (run: MigrationRunWithKind) =>
	summarizeMigration({
		migration,
		listContext: {
			migrations: [migration],
			latestRuns: [run],
			orgActiveRuns: [],
			itemRunCounts: [],
			customerCounts: new Map(),
			products: [],
		} satisfies MigrationListContext,
	});

describe("summarizeMigration error_code", () => {
	test("carries the recorded code next to the raw error", () => {
		const summary = summarize(
			failedRunAll({
				errorMessage: "Error in run-batch-migration-chunk: …",
				errorCode: MigrationRunErrorCode.CacheInvalidationIncomplete,
			}),
		);
		expect(summary.latest_run?.error_message).toBe(
			"Error in run-batch-migration-chunk: …",
		);
		expect(summary.latest_run?.error_code).toBe(
			MigrationRunErrorCode.CacheInvalidationIncomplete,
		);
	});

	test("an error recorded before codes existed reads as unknown", () => {
		const summary = summarize(
			failedRunAll({ errorMessage: "boom", errorCode: null }),
		);
		expect(summary.latest_run?.error_code).toBe(MigrationRunErrorCode.Unknown);
	});

	test("a run without an error has no code", () => {
		const summary = summarize(
			failedRunAll({ errorMessage: null, errorCode: null }),
		);
		expect(summary.latest_run?.error_code).toBeNull();
	});
});
