import { describe, expect, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import { PgDialect } from "drizzle-orm/pg-core";
import { nominationQuery } from "@/internal/customers/resolveByFeatureBalanceSort.js";

const dialect = new PgDialect();
const normalize = (value: string) => value.replace(/\s+/g, " ").trim();

const render = (createdAtRange?: { start?: number; end?: number }) =>
	dialect.sqlToQuery(
		nominationQuery({
			orgId: "org_target",
			env: AppEnv.Live,
			createdAtRange,
			internalFeatureId: "feature_target",
			after: null,
			sortOrder: "desc",
			basis: "usage",
		}),
	);

describe("feature balance nomination query", () => {
	test("does not join customers without a created-at range", () => {
		const { sql } = render();

		expect(normalize(sql)).not.toContain("SEMI JOIN main.customers");
	});

	test("applies both created-at bounds before nomination", () => {
		const { sql, params } = render({ start: 1_000, end: 2_000 });
		const query = normalize(sql);

		expect(query).toContain("SEMI JOIN main.customers c");
		expect(query).toContain("c.internal_id = internal_customer_id");
		expect(query).toContain("c.org_id = $1");
		expect(query).toContain("c.env = $2");
		expect(query).toContain("c.created_at >= $3");
		expect(query).toContain("c.created_at <= $4");
		expect(params).toEqual([
			"org_target",
			AppEnv.Live,
			1_000,
			2_000,
			"feature_target",
			500,
		]);
	});

	test("supports a single created-at bound", () => {
		const { sql, params } = render({ end: 2_000 });
		const query = normalize(sql);

		expect(query).toContain("SEMI JOIN main.customers c");
		expect(query).not.toContain("c.created_at >=");
		expect(query).toContain("c.created_at <= $3");
		expect(params).toEqual([
			"org_target",
			AppEnv.Live,
			2_000,
			"feature_target",
			500,
		]);
	});
});
