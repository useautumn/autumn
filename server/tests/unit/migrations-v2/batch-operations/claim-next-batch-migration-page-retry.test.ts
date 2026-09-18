import { describe, expect, test } from "bun:test";
import { MigrationItemRunStatus } from "@autumn/shared";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { claimNextBatchMigrationPage } from "@/internal/migrations/v2/batchOperations/execute/claim/claimNextBatchMigrationPage.js";
import type { MigrationRuntimeWithEventId } from "@/internal/migrations/v2/types/migrationDefinition.js";

const dialect = new PgDialect();

const captureClaimQuery = async ({
	retryItemStatuses,
}: {
	retryItemStatuses?: ("failed" | "skipped")[];
}) => {
	let captured: SQL | undefined;
	const ctx = {
		org: { id: "org_test" },
		env: "live",
		features: [],
		db: {
			execute: async (query: SQL) => {
				captured = query;
				return [];
			},
		},
		// biome-ignore lint/suspicious/noExplicitAny: minimal ctx for the claim
	} as any;

	await claimNextBatchMigrationPage({
		ctx,
		migration: {
			internal_id: "mig_internal_test",
			id: "free-update-709",
			filter: undefined,
		} as unknown as MigrationRuntimeWithEventId,
		migrationInternalId: "mig_internal_test",
		migrationRunId: "mrun_retry",
		limit: 5000,
		// `only` gives the planner a non-empty customer filter without a DB.
		controls: { only: ["cus_scoped"], retryItemStatuses },
	});

	if (!captured) throw new Error("claim did not run its statement");
	return dialect.sqlToQuery(captured);
};

const arrayParams = (params: unknown[]): string[][] =>
	params.filter((param): param is string[] => Array.isArray(param));
// The checkpoint anti-join binds each excluded status as its own scalar.
const scalarParams = (params: unknown[]): string[] =>
	params.filter((param): param is string => typeof param === "string");

describe("claimNextBatchMigrationPage retry claiming", () => {
	test("a plain run never re-claims succeeded, skipped, or failed customers", async () => {
		const { params } = await captureClaimQuery({});

		expect(arrayParams(params)).toContainEqual([
			MigrationItemRunStatus.Running,
		]);
		const excluded = scalarParams(params);
		expect(excluded).toContain(MigrationItemRunStatus.Succeeded);
		expect(excluded).toContain(MigrationItemRunStatus.Skipped);
		expect(excluded).toContain(MigrationItemRunStatus.Failed);
	});

	test("retrying failed customers takes over failed claims and still excludes succeeded ones", async () => {
		const { params } = await captureClaimQuery({
			retryItemStatuses: [MigrationItemRunStatus.Failed],
		});

		expect(arrayParams(params)).toContainEqual([
			MigrationItemRunStatus.Running,
			MigrationItemRunStatus.Failed,
		]);
		const excluded = scalarParams(params);
		expect(excluded).toContain(MigrationItemRunStatus.Succeeded);
		expect(excluded).toContain(MigrationItemRunStatus.Skipped);
		expect(excluded).not.toContain(MigrationItemRunStatus.Failed);
	});
});
