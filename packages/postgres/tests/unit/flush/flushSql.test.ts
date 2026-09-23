import { describe, expect, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";
import { flushSql } from "../../../src/flush/repos/flushSql.js";

const dialect = new PgDialect();
const flatten = (sql: string) => sql.replace(/\s+/g, " ").trim();

describe("flushSql", () => {
	test("one statement: a CTE per update, one for every bookmark, and a row of counts", () => {
		const query = dialect.sqlToQuery(
			flushSql({
				changes: [
					{
						op: "update",
						table: "customerEntitlements",
						id: "ce_1",
						set: {},
						add: { balance: -5 },
						addEntries: {},
						guard: {},
					},
					{
						op: "update",
						table: "rollovers",
						id: "ro_1",
						set: {},
						add: { usage: 2 },
						addEntries: {},
						guard: {},
					},
				],
				bookmarks: [
					{
						topic: "metering",
						partition: 3,
						expectedOffset: 40n,
						nextOffset: 42n,
					},
					{
						topic: "metering",
						partition: 7,
						expectedOffset: 9n,
						nextOffset: 10n,
					},
				],
			}),
		);
		const sql = flatten(query.sql);
		expect(
			sql.startsWith('WITH "u0" AS ( UPDATE "customer_entitlements"'),
		).toBe(true);
		expect(sql).toContain('"u1" AS ( UPDATE "rollovers"');
		expect(sql).toContain(
			"b AS ( UPDATE partition_progress p SET next_offset = v.next_offset::bigint, command_next_offset = GREATEST(v.command_next_offset::bigint, p.command_next_offset) FROM (VALUES ($5, $6, $7, $8, $9), ($10, $11, $12, $13, $14))",
		);
		expect(sql).toContain(
			"AND p.next_offset = v.expected_offset::bigint RETURNING p.topic )",
		);
		expect(
			sql.endsWith(
				'SELECT to_json(ARRAY[(SELECT count(*) FROM "u0"), (SELECT count(*) FROM "u1")]) AS applied, (SELECT count(*) FROM b) AS bookmarks',
			),
		).toBe(true);
		expect(query.params).toEqual([
			-5,
			"ce_1",
			2,
			"ro_1",
			"metering",
			3,
			40n,
			42n,
			null,
			"metering",
			7,
			9n,
			10n,
			null,
		]);
	});

	test("an insert and a delete are CTEs like any update", () => {
		const query = dialect.sqlToQuery(
			flushSql({
				changes: [
					{
						op: "insert",
						table: "usageWindows",
						row: { id: "uw_1", usage: 5, filter_key: null },
					},
					{ op: "delete", table: "rollovers", id: "ro_1" },
				],
				bookmarks: [
					{
						topic: "metering",
						partition: 0,
						expectedOffset: 1n,
						nextOffset: 2n,
					},
				],
			}),
		);
		const sql = flatten(query.sql);
		expect(sql).toContain(
			'"u0" AS ( INSERT INTO "usage_windows" ("id", "usage", "filter_key") VALUES ($1, $2, $3) RETURNING "id" )',
		);
		expect(sql).toContain(
			'"u1" AS ( DELETE FROM "rollovers" WHERE "id" = $4 RETURNING "id" )',
		);
		expect(query.params.slice(0, 4)).toEqual(["uw_1", 5, null, "ro_1"]);
	});

	test("a flush with bookmarks only still moves them", () => {
		const query = dialect.sqlToQuery(
			flushSql({
				changes: [],
				bookmarks: [
					{
						topic: "metering",
						partition: 0,
						expectedOffset: 1n,
						nextOffset: 2n,
					},
				],
			}),
		);
		expect(flatten(query.sql)).toContain("SELECT '[]'::json AS applied");
	});
});
