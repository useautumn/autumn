import { describe, expect, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";
import {
	readSubjectSnapshots,
	readSubjectSnapshotsSql,
} from "../../../src/subjects/repos/subjectSnapshots/readSubjectSnapshots.js";

const dialect = new PgDialect();
const flatten = (sql: string) => sql.replace(/\s+/g, " ").trim();

const keys = [
	{ orgId: "org_1", env: "live", customerId: "cus_1", entityId: null },
	{ orgId: "org_1", env: "live", customerId: "cus_1", entityId: "seat_1" },
];

describe("readSubjectSnapshots", () => {
	test("one statement probes the primary key for every key at one version, the customer's own subject as an empty entity id", () => {
		const { sql, params } = dialect.sqlToQuery(
			readSubjectSnapshotsSql({ keys, stateVersion: 1 }),
		);
		const text = flatten(sql);
		expect(text).toContain("FROM subject_snapshots s");
		expect(text).toContain("WHERE s.state_version = $2");
		expect(params[1]).toBe(1);
		expect(text).toContain(
			"JOIN jsonb_to_recordset($1::text::jsonb) AS k(org_id text, env text, customer_id text, entity_id text)",
		);
		for (const column of ["org_id", "env", "customer_id", "entity_id"])
			expect(text).toContain(`s.${column} = k.${column} COLLATE "C"`);
		expect(JSON.parse(String(params[0]))).toEqual([
			{ org_id: "org_1", env: "live", customer_id: "cus_1", entity_id: "" },
			{
				org_id: "org_1",
				env: "live",
				customer_id: "cus_1",
				entity_id: "seat_1",
			},
		]);
	});

	test("rows come back under the identity the worker holds, and no keys means no statement", async () => {
		const statements: unknown[] = [];
		const db = {
			execute: async (query: unknown) => {
				statements.push(query);
				return [
					{
						org_id: "org_1",
						env: "live",
						customer_id: "cus_1",
						entity_id: "",
						state: { revision: 0 },
						baseline_at: "1700000000000",
					},
				];
			},
		};

		expect(
			await readSubjectSnapshots({ ctx: { db }, keys: [], stateVersion: 1 }),
		).toEqual([]);
		expect(statements).toHaveLength(0);

		expect(
			await readSubjectSnapshots({ ctx: { db }, keys, stateVersion: 1 }),
		).toEqual([
			{
				orgId: "org_1",
				env: "live",
				customerId: "cus_1",
				entityId: null,
				state: { revision: 0 },
				baselineAt: 1_700_000_000_000,
			},
		]);
		expect(statements).toHaveLength(1);
	});
});
