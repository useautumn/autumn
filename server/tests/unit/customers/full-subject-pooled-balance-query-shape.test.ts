import { describe, expect, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import { PgDialect } from "drizzle-orm/pg-core";
import { getFullSubjectQuery } from "@/internal/customers/repos/getFullSubject/getFullSubjectQuery.js";

const dialect = new PgDialect();
const normalize = (value: string) => value.replace(/\s+/g, " ").trim();

describe("FullSubject pooled-balance query shape", () => {
	test("entity reads hydrate the shared balance without joining contribution sources or sibling entities", () => {
		const query = getFullSubjectQuery({
			orgId: "org_test",
			env: AppEnv.Sandbox,
			customerId: "customer_test",
			entityId: "entity_one",
		});
		const { sql } = dialect.sqlToQuery(query);
		const normalized = normalize(sql);

		expect(normalized).not.toContain("pooled_balance_contributions");
		expect(normalized).not.toContain("pooled_balances");
		expect(normalized).toContain(
			"cp.internal_entity_id IS NULL AND cp.customer_license_link_id IS NULL",
		);
		expect(normalized).toContain(
			"cp.internal_entity_id = sr.internal_entity_id",
		);
		expect(normalized).toContain("ce.customer_product_id IS NULL");
		expect(normalized).toContain(
			"ce.internal_customer_id = sr.internal_customer_id",
		);
	});
});
