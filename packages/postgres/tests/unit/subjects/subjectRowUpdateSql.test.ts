import { describe, expect, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";
import {
	promotePooledContributionsSql,
	subjectRowUpdateSql,
} from "../../../src/subjects/repos/applySubjectRowUpdates/subjectRowUpdateSql.js";
import type { SubjectRowUpdate } from "../../../src/subjects/types/subjectRowUpdate.js";

const dialect = new PgDialect();

const update = (
	fields: Partial<SubjectRowUpdate> & Pick<SubjectRowUpdate, "table" | "id">,
): SubjectRowUpdate => ({
	set: {},
	add: {},
	addEntries: {},
	guard: {},
	...fields,
});
const add = update;
const set = update;

const flatten = (sql: string) => sql.replace(/\s+/g, " ").trim();

describe("subjectRowUpdateSql", () => {
	test("an add moves a counter on whatever the row holds, guarded only by its id", () => {
		const query = dialect.sqlToQuery(
			subjectRowUpdateSql({
				update: add({
					table: "customerEntitlements",
					id: "ce_1",
					add: { balance: -5 },
				}),
			}),
		);
		expect(flatten(query.sql)).toBe(
			'UPDATE "customer_entitlements" SET "balance" = "balance" + $1 WHERE "id" = $2 RETURNING "id"',
		);
		expect(query.params).toEqual([-5, "ce_1"]);
	});

	test("a pool's grant moves by a share the way a balance does", () => {
		const query = dialect.sqlToQuery(
			subjectRowUpdateSql({
				update: add({
					table: "pooledBalances",
					id: "pool_1",
					add: { granted: 100 },
				}),
			}),
		);
		expect(flatten(query.sql)).toBe(
			'UPDATE "pooled_balances" SET "granted" = "granted" + $1 WHERE "id" = $2 RETURNING "id"',
		);
		expect(query.params).toEqual([100, "pool_1"]);
	});

	test("a guarded add: a window consume must still be in the window it counted", () => {
		const query = dialect.sqlToQuery(
			subjectRowUpdateSql({
				update: add({
					table: "usageWindows",
					id: "uw_1",
					add: { usage: 5 },
					guard: {
						window_start_at: 1,
						window_end_at: 2,
						anchor_customer_entitlement_id: null,
					},
				}),
			}),
		);
		expect(flatten(query.sql)).toBe(
			'UPDATE "usage_windows" SET "usage" = "usage" + $1 WHERE "id" = $2 AND abs("window_start_at" - $3) < $4 AND abs("window_end_at" - $5) < $6 AND "anchor_customer_entitlement_id" IS NOT DISTINCT FROM $7 RETURNING "id"',
		);
		expect(query.params).toEqual([5, "uw_1", 1, 1e-9, 2, 1e-9, null]);
	});

	test("a set replaces columns under the full before guard", () => {
		const query = dialect.sqlToQuery(
			subjectRowUpdateSql({
				update: set({
					table: "usageWindows",
					id: "uw_1",
					set: { usage: 5, window_start_at: 2, updated_at: 1_700_000_000_000 },
					guard: { usage: 3, window_start_at: 1 },
				}),
			}),
		);
		expect(flatten(query.sql)).toBe(
			'UPDATE "usage_windows" SET "usage" = $1, "window_start_at" = $2, "updated_at" = $3 WHERE "id" = $4 AND abs("usage" - $5) < $6 AND abs("window_start_at" - $7) < $8 RETURNING "id"',
		);
		expect(query.params).toEqual([
			5,
			2,
			1_700_000_000_000,
			"uw_1",
			3,
			1e-9,
			1,
			1e-9,
		]);
	});

	test("jsonb guards compare as jsonb and nulls with IS NOT DISTINCT FROM", () => {
		const query = dialect.sqlToQuery(
			subjectRowUpdateSql({
				update: set({
					table: "customerEntitlements",
					id: "ce_1",
					set: { usage_attribution: { total: 2 } },
					guard: { usage_attribution: { total: 1 }, next_reset_at: null },
				}),
			}),
		);
		expect(flatten(query.sql)).toContain(
			'"usage_attribution" IS NOT DISTINCT FROM $3::text::jsonb AND "next_reset_at" IS NOT DISTINCT FROM $4',
		);
		expect(query.params).toEqual(['{"total":2}', "ce_1", '{"total":1}', null]);
	});

	test("an entity entry is rebuilt in place, seeded with its id when missing, and never pruned", () => {
		const query = dialect.sqlToQuery(
			subjectRowUpdateSql({
				update: add({
					table: "customerEntitlements",
					id: "ce_1",
					addEntries: { entities: { ent_42: { balance: -3, adjustment: 1 } } },
				}),
			}),
		);
		expect(flatten(query.sql)).toBe(
			'UPDATE "customer_entitlements" SET "entities" = jsonb_set(coalesce("entities", \'{}\'::jsonb), ARRAY[$1]::text[], ' +
				"coalesce(\"entities\" -> $2, jsonb_build_object('id', $3::text, 'balance', 0, 'adjustment', 0)) || jsonb_build_object(" +
				'$4::text, to_jsonb(coalesce(("entities" -> $5 ->> $6)::numeric, 0) + $7), ' +
				'$8::text, to_jsonb(coalesce(("entities" -> $9 ->> $10)::numeric, 0) + $11))) ' +
				'WHERE "id" = $12 RETURNING "id"',
		);
		expect(query.params).toEqual([
			"ent_42",
			"ent_42",
			"ent_42",
			"balance",
			"ent_42",
			"balance",
			-3,
			"adjustment",
			"ent_42",
			"adjustment",
			1,
			"ce_1",
		]);
	});

	test("an attribution entry that reaches zero is removed instead of written back", () => {
		const query = dialect.sqlToQuery(
			subjectRowUpdateSql({
				update: add({
					table: "customerEntitlements",
					id: "ce_1",
					add: { balance: 12.5 },
					addEntries: {
						usage_attribution: { feat_a: { units: -15, credits: -12.5 } },
					},
				}),
			}),
		);
		const sql = flatten(query.sql);
		expect(sql).toContain('"balance" = "balance" + $1');
		expect(sql).toContain(
			'"usage_attribution" = CASE WHEN ((coalesce("usage_attribution" -> $2, \'{"units":0,"credits":0}\'::jsonb) || jsonb_build_object(',
		);
		expect(sql).toContain(
			"THEN coalesce(\"usage_attribution\", '{}'::jsonb) - $",
		);
		expect(sql).toContain(
			"ELSE jsonb_set(coalesce(\"usage_attribution\", '{}'::jsonb), ARRAY[$",
		);
		expect(query.params[0]).toBe(12.5);
		expect(query.params.at(-1)).toBe("ce_1");
	});

	test("a column set and added to in one flush lands as the set value plus the delta", () => {
		const query = dialect.sqlToQuery(
			subjectRowUpdateSql({
				update: update({
					table: "usageWindows",
					id: "uw_1",
					set: { usage: 0, window_start_at: 2 },
					add: { usage: 5 },
				}),
			}),
		);
		expect(flatten(query.sql)).toBe(
			'UPDATE "usage_windows" SET "usage" = $1 + $2, "window_start_at" = $3 WHERE "id" = $4 RETURNING "id"',
		);
		expect(query.params).toEqual([0, 5, 2, "uw_1"]);
	});

	test("refuses columns the schema lacks, non-numeric adds, and adds into a non-map column", () => {
		expect(() =>
			subjectRowUpdateSql({
				update: set({
					table: "customerEntitlements",
					id: "ce_1",
					set: { balance: 1, "; DROP TABLE": 1 },
				}),
			}),
		).toThrow("Unknown column for customerEntitlements: ; DROP TABLE");
		expect(() =>
			subjectRowUpdateSql({
				update: add({
					table: "customerEntitlements",
					id: "ce_1",
					add: { customer_product_id: 1 },
				}),
			}),
		).toThrow("is not numeric");
		expect(() =>
			subjectRowUpdateSql({
				update: add({
					table: "customerEntitlements",
					id: "ce_1",
					addEntries: { balance: { a: { b: 1 } } },
				}),
			}),
		).toThrow("is not a counter map");
		expect(() =>
			subjectRowUpdateSql({ update: add({ table: "rollovers", id: "ro_1" }) }),
		).toThrow("sets no columns");
	});

	test("a customer is keyed on internal_id, and a jsonb guard compares as jsonb", () => {
		const query = dialect.sqlToQuery(
			subjectRowUpdateSql({
				update: set({
					table: "customers",
					id: "cus_internal_1",
					set: { processor: { id: "cus_stripe_1", type: "stripe" } },
					guard: { processor: null },
				}),
			}),
		);
		expect(flatten(query.sql)).toBe(
			'UPDATE "customers" SET "processor" = $1::text::jsonb WHERE "internal_id" = $2 AND "processor" IS NOT DISTINCT FROM $3::text::jsonb RETURNING "internal_id"',
		);
		expect(query.params).toEqual([
			'{"id":"cus_stripe_1","type":"stripe"}',
			"cus_internal_1",
			null,
		]);
	});

	test("a customer product's text[] columns are replaced and guarded as arrays", () => {
		const query = dialect.sqlToQuery(
			subjectRowUpdateSql({
				update: set({
					table: "customerProducts",
					id: "cp_1",
					set: { subscription_ids: ["sub_1"], scheduled_ids: [] },
					guard: { subscription_ids: [], scheduled_ids: null },
				}),
			}),
		);
		expect(flatten(query.sql)).toBe(
			'UPDATE "customer_products" SET "subscription_ids" = ARRAY[$1]::text[], "scheduled_ids" = ARRAY[]::text[] ' +
				'WHERE "id" = $2 AND "subscription_ids" IS NOT DISTINCT FROM ARRAY[]::text[] AND "scheduled_ids" IS NOT DISTINCT FROM NULL RETURNING "id"',
		);
		expect(query.params).toEqual(["sub_1", "cp_1"]);
	});

	test("a promote moves every share of the pool due by the reset to its next value, in one statement", () => {
		const query = dialect.sqlToQuery(
			promotePooledContributionsSql({
				pooledBalanceId: "pool_1",
				dueBy: 1_700,
			}),
		);
		expect(flatten(query.sql)).toBe(
			"UPDATE pooled_balance_contributions SET current_contribution = next_cycle_contribution, effective_at = NULL, updated_at = $1 WHERE pooled_balance_id = $2 AND effective_at IS NOT NULL AND effective_at <= $3 RETURNING id",
		);
		expect(query.params).toEqual([1_700, "pool_1", 1_700]);
	});
});
