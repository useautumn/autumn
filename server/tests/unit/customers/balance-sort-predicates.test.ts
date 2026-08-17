import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { liveCusEntPredicate } from "@/internal/customers/resolveByFeatureBalanceSort.js";

const dialect = new PgDialect();

describe("balance sort predicates", () => {
	test("excludes drained loose entitlements from exact balance totals", () => {
		const { sql: query, params } = dialect.sqlToQuery(
			sql`SELECT 1 FROM customer_entitlements ce LEFT JOIN customer_products cp ON cp.id = ce.customer_product_id WHERE ${liveCusEntPredicate()}`,
		);
		const normalized = query.replace(/\s+/g, " ").trim();

		expect(normalized).toContain(
			"ce.customer_product_id IS NULL AND ( ce.balance != 0 OR ce.unlimited IS TRUE",
		);
		expect(normalized).toContain("AND f.type = 'boolean'");
		expect(normalized).toContain("OR cp.status IN ($1, $2)");
		expect(params).toEqual(["active", "past_due"]);
	});
});
