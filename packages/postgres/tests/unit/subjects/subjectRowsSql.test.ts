import { describe, expect, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";
import { subjectRowsSql } from "../../../src/subjects/repos/getSubjectRows/subjectRowsSql.js";

const dialect = new PgDialect();

describe("subjectRowsSql", () => {
	test("binds every input as a parameter and keeps the text stable", () => {
		const first = dialect.sqlToQuery(
			subjectRowsSql({
				ctx: { orgId: "org_1", env: "sandbox" },
				customerId: "cus_1",
				entityId: null,
				statuses: ["active", "past_due"],
				asOfTimestampMs: 1_700_000_000_000,
			}),
		);
		const second = dialect.sqlToQuery(
			subjectRowsSql({
				ctx: { orgId: "org_2", env: "live" },
				customerId: "cus_2",
				entityId: null,
				statuses: ["active"],
				asOfTimestampMs: 1_800_000_000_000,
			}),
		);

		expect(first.params).toEqual([
			"org_1",
			"sandbox",
			"cus_1",
			"cus_1",
			"cus_1",
			null,
			null,
			null,
			"active,past_due",
			1_700_000_000_000,
			1_700_000_000_000,
			1_700_000_000_000,
		]);
		expect(first.sql).toBe(second.sql);
		expect(first.sql).not.toContain("org_1");
	});

	test("a customer subject keeps customer-level rows, an entity subject keeps the entity's own rows", () => {
		const customerQuery = dialect.sqlToQuery(
			subjectRowsSql({
				ctx: { orgId: "org_1", env: "sandbox" },
				customerId: "cus_1",
				entityId: null,
				statuses: ["active"],
				asOfTimestampMs: 1_700_000_000_000,
			}),
		);
		const entityQuery = dialect.sqlToQuery(
			subjectRowsSql({
				ctx: { orgId: "org_1", env: "sandbox" },
				customerId: "cus_1",
				entityId: "ent_42",
				statuses: ["active"],
				asOfTimestampMs: 1_700_000_000_000,
			}),
		);

		expect(customerQuery.sql).toContain("cp.internal_entity_id IS NULL");
		expect(customerQuery.sql).toContain("ce.internal_entity_id IS NULL");
		expect(entityQuery.sql).toContain(
			"cp.internal_entity_id IN (SELECT internal_id FROM entity_record)",
		);
		expect(entityQuery.sql).toContain(
			"ce.internal_entity_id IN (SELECT internal_id FROM entity_record)",
		);
		expect(entityQuery.params).toContain("ent_42");
	});
});

describe("subjectRowsSql: pooled balances", () => {
	test("the pool behind pooled plan items is loaded with its pooled_balances row; its sources are not", () => {
		const { sql } = dialect.sqlToQuery(
			subjectRowsSql({
				ctx: { orgId: "org_1", env: "sandbox" },
				customerId: "cus_1",
				entityId: "ent_42",
				statuses: ["active"],
				asOfTimestampMs: 1_700_000_000_000,
			}),
		);

		// The pool is a customer-level row: only the customer's own load carries it, an entity command reads the customer's copy.
		expect(sql).toContain("pooled_entitlements AS (");
		expect(sql).toContain("WHERE FALSE\n\t\t\tAND ce.internal_customer_id");
		expect(
			dialect.sqlToQuery(
				subjectRowsSql({
					ctx: { orgId: "org_1", env: "sandbox" },
					customerId: "cus_1",
					entityId: null,
					statuses: ["active"],
					asOfTimestampMs: 1_700_000_000_000,
				}),
			).sql,
		).toContain("WHERE TRUE\n\t\t\tAND ce.internal_customer_id");
		expect(sql).toContain(
			"JOIN pooled_balances pb ON pb.id = ce.pooled_balance_id",
		);
		expect(sql).toContain("AND ce.pooled_balance_id IS NOT NULL");
		expect(sql).toContain("AND ce.pooled_contribution_id IS NULL");
		expect(sql).toContain("AND pb.customer_license_link_id IS NULL");
		expect(sql).toContain("SELECT * FROM pooled_entitlements");
		expect(sql).toContain("'pooled_balances', COALESCE(");
		// Product and loose rows still leave every pooled row out.
		expect(sql.match(/ce\.pooled_balance_id IS NULL/g)).toHaveLength(2);
	});
});
