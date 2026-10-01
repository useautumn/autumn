import { describe, expect, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";
import { entitySubjectRowsSql } from "../../../src/subjects/repos/getSubjectRows/entitySubjectRowsSql.js";
import { SUBJECT_ROW_LIMITS } from "../../../src/subjects/repos/getSubjectRows/subjectRowLimits.js";

const dialect = new PgDialect();

describe("entitySubjectRowsSql", () => {
	test("binds every input as a parameter, keeps the text stable, and probes each entity laterally", () => {
		const first = dialect.sqlToQuery(
			entitySubjectRowsSql({
				ctx: { orgId: "org_1", env: "sandbox" },
				customerId: "cus_1",
				entityIds: ["ent_1", "ent_2"],
				statuses: ["active", "past_due"],
				asOfTimestampMs: 1_700_000_000_000,
			}),
		);
		const second = dialect.sqlToQuery(
			entitySubjectRowsSql({
				ctx: { orgId: "org_2", env: "live" },
				customerId: "cus_2",
				entityIds: ["ent_9"],
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
			"org_1",
			"ent_1,ent_2",
			"sandbox",
			"ent_1,ent_2",
			"ent_1,ent_2",
			SUBJECT_ROW_LIMITS.entitiesPerLoad,
			"active,past_due",
			"active,past_due",
			SUBJECT_ROW_LIMITS.customerProducts,
			1_700_000_000_000,
			SUBJECT_ROW_LIMITS.looseCustomerEntitlements,
			1_700_000_000_000,
		]);
		expect(first.sql).toBe(second.sql);
		expect(first.sql).not.toContain("ent_1");
		expect(first.sql.match(/LEFT JOIN LATERAL/g)).toHaveLength(6);
		expect(first.sql).toContain("cp.internal_entity_id = e.internal_id");
		expect(first.sql).not.toContain(
			"cp.internal_customer_id = e.internal_customer_id",
		);
		expect(first.sql).toContain("e.id = ANY(string_to_array($");
		expect(first.sql).toContain("e.internal_id = ANY(string_to_array($");
		expect(first.sql).toContain("uw.internal_entity_id = e.internal_id");
	});

	test("refuses an empty or oversized entity list instead of sending it", () => {
		const build = (count: number) =>
			entitySubjectRowsSql({
				ctx: { orgId: "org_1", env: "sandbox" },
				customerId: "cus_1",
				entityIds: Array.from({ length: count }, (_, index) => `ent_${index}`),
				statuses: ["active"],
				asOfTimestampMs: 1_700_000_000_000,
			});
		expect(() => build(0)).toThrow(RangeError);
		expect(() => build(SUBJECT_ROW_LIMITS.entitiesPerLoad + 1)).toThrow(
			RangeError,
		);
		expect(() => build(SUBJECT_ROW_LIMITS.entitiesPerLoad)).not.toThrow();
	});
});
