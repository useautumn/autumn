import { describe, expect, test } from "bun:test";
import { buildRunMigrationRequest } from "@/views/migrations/migration/hooks/buildRunMigrationRequest";

describe("buildRunMigrationRequest", () => {
	test("disables lazy execution for full migration runs", () => {
		expect(
			buildRunMigrationRequest({
				migrationId: "disable-lazy-runs",
				dryRun: false,
			}),
		).toEqual({
			id: "disable-lazy-runs",
			dry_run: false,
			lazy_run: false,
		});
	});

	test("keeps targeted-run retry defaults without enabling lazy execution", () => {
		expect(
			buildRunMigrationRequest({
				migrationId: "disable-lazy-runs",
				dryRun: false,
				only: ["customer_1"],
			}),
		).toEqual({
			id: "disable-lazy-runs",
			dry_run: false,
			only: ["customer_1"],
			lazy_run: false,
			retry_item_statuses: ["failed"],
		});
	});
});
