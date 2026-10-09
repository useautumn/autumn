import { describe, expect, test } from "bun:test";
import {
	findBlockingIndexStatements,
	findCreatedTables,
} from "./safetyCheck.ts";

const NEW_TABLE_MIGRATION = `CREATE TABLE "atom_deployments" (
	"id" text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "atom_deployments_key" ON "atom_deployments" USING btree ("id");`;

describe("findBlockingIndexStatements", () => {
	test("flags a plain index on an existing table", () => {
		const blockers = findBlockingIndexStatements(
			`CREATE INDEX "idx_customers_email" ON "customers" USING btree ("email");`,
		);
		expect(blockers.map((blocker) => blocker.kind)).toEqual(["CREATE INDEX"]);
	});

	test("allows an index on a table created in the same batch", () => {
		const newTables = findCreatedTables([NEW_TABLE_MIGRATION]);
		expect(findBlockingIndexStatements(NEW_TABLE_MIGRATION, newTables)).toEqual(
			[],
		);
	});

	test("matches schema-qualified names across migrations", () => {
		const newTables = findCreatedTables([
			`CREATE TABLE IF NOT EXISTS "public"."subject_snapshots" ("id" text);`,
		]);
		const blockers = findBlockingIndexStatements(
			`CREATE INDEX "idx_a" ON "subject_snapshots" ("id");--> statement-breakpoint
DROP INDEX "idx_b";`,
			newTables,
		);
		expect(blockers.map((blocker) => blocker.kind)).toEqual(["DROP INDEX"]);
	});
});
