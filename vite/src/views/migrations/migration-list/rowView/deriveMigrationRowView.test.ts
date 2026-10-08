import { expect, test } from "bun:test";
import {
	FIXTURE_NOW,
	fixtureCatalog,
	fixtureMigrations,
} from "../preview/migrationListFixtures";
import { toMigrationListRows } from "./deriveMigrationRowView";

test("a row whose customer count never arrived hides run progress; rows with counts keep it", () => {
	const rows = toMigrationListRows({
		migrations: fixtureMigrations.map((migration) =>
			migration.id === "migration-pro-v3-rollout"
				? {
						...migration,
						summary: { ...migration.summary, customer_count: null },
					}
				: migration,
		),
		catalog: fixtureCatalog,
		now: FIXTURE_NOW,
		pendingCustomerCountIds: new Set(["migration-pro-v3-rollout"]),
	});
	const status = (id: string) => rows.find((row) => row.id === id)?.view.status;

	expect(status("migration-pro-v3-rollout")?.chip).toEqual({
		label: "Running",
		details: undefined,
	});
	expect(status("migration-pro-v3-rollout")?.ring.fraction).toBe(0);
	expect(status("migration-starter-v2")?.chip).toEqual({
		label: "Incomplete",
		details: ["at 80%"],
	});
});
