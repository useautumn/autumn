import { describe, expect, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";
import {
	subjectRowInsertSql,
	UnknownSubjectRowColumnError,
} from "../../../src/subjects/repos/applySubjectRowUpdates/subjectRowUpdateSql.js";

const dialect = new PgDialect();
const flatten = (sql: string) => sql.replace(/\s+/g, " ").trim();

const render = (params: Parameters<typeof subjectRowInsertSql>[0]) => {
	const query = dialect.sqlToQuery(subjectRowInsertSql(params));
	return { sql: flatten(query.sql), params: query.params };
};

describe("subjectRowInsertSql", () => {
	test("a jsonb[] column is an ARRAY of jsonb elements cast to jsonb[], a text[] column an ARRAY cast to text[]", () => {
		const { sql, params } = render({
			table: "customerProducts",
			row: {
				id: "cp_1",
				options: [
					{ feature_id: "seats", quantity: 3 },
					{ feature_id: "credits", quantity: 100 },
				],
				subscription_ids: ["sub_stripe_1", "sub_stripe_2"],
			},
		});
		expect(sql).toBe(
			'INSERT INTO "customer_products" ("id", "options", "subscription_ids") VALUES ($1, ARRAY[$2::text::jsonb, $3::text::jsonb]::jsonb[], ARRAY[$4, $5]::text[]) RETURNING "id"',
		);
		expect(params).toEqual([
			"cp_1",
			JSON.stringify({ feature_id: "seats", quantity: 3 }),
			JSON.stringify({ feature_id: "credits", quantity: 100 }),
			"sub_stripe_1",
			"sub_stripe_2",
		]);
	});

	test("an empty array keeps its cast, which Postgres needs to type it; null is NULL", () => {
		const { sql, params } = render({
			table: "customerProducts",
			row: {
				id: "cp_1",
				options: [],
				scheduled_ids: [],
				subscription_ids: null,
			},
		});
		expect(sql).toBe(
			'INSERT INTO "customer_products" ("id", "options", "scheduled_ids", "subscription_ids") VALUES ($1, ARRAY[]::jsonb[], ARRAY[]::text[], NULL) RETURNING "id"',
		);
		expect(params).toEqual(["cp_1"]);
	});

	test("a customers row binds plain columns as values and jsonb columns as text cast to jsonb", () => {
		const { sql, params } = render({
			table: "customers",
			row: {
				internal_id: "cus_internal_1",
				id: "cus_1",
				metadata: { plan: "team" },
				processor: null,
			},
		});
		expect(sql).toBe(
			'INSERT INTO "customers" ("internal_id", "id", "metadata", "processor") VALUES ($1, $2, $3::text::jsonb, $4::text::jsonb) RETURNING "internal_id"',
		);
		expect(params).toEqual([
			"cus_internal_1",
			"cus_1",
			JSON.stringify({ plan: "team" }),
			null,
		]);
	});

	test("refuses a column the table lacks", () => {
		expect(() =>
			render({ table: "customerPrices", row: { id: "cpr_1", balance: 1 } }),
		).toThrow(UnknownSubjectRowColumnError);
	});

	test("an entities row is keyed on internal_id, like customers", () => {
		const { sql } = render({
			table: "entities",
			row: { internal_id: "ent_internal_1", id: "seat_1", usage_limits: null },
		});
		expect(sql).toBe(
			'INSERT INTO "entities" ("internal_id", "id", "usage_limits") VALUES ($1, $2, $3::text::jsonb) RETURNING "internal_id"',
		);
	});
});
