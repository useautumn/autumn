import { describe, expect, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import { PgDialect } from "drizzle-orm/pg-core";
import { buildSearchPredicates } from "@/internal/customers/CusSearchService.js";
import { getCustomerListFilterSql } from "@/internal/customers/getFullCusQuery.js";

const dialect = new PgDialect();

describe("customer search predicates", () => {
	test.each(["cus_AbC123", "aBc", "cus_'quoted"])(
		"parameterizes processor ID substring search for %s in both paths",
		(search) => {
			const cursor = dialect.sqlToQuery(
				buildSearchPredicates({
					orgId: "org_test",
					env: AppEnv.Live,
					search,
				}).whereRaw,
			);
			expect(cursor.sql).toContain(
				`OR ("customers"."processor" ->> 'id') ILIKE $6`,
			);
			expect(cursor.params).toEqual([
				"org_test",
				AppEnv.Live,
				...Array(4).fill(`%${search}%`),
			]);

			const list = dialect.sqlToQuery(
				getCustomerListFilterSql({ search: ` ${search} ` }),
			);
			expect(list.sql).toContain("OR (c.processor ->> 'id') ILIKE $4");
			expect(list.params).toEqual(Array(4).fill(`%${search}%`));
		},
	);

	test("does not add search predicates for an empty search", () => {
		const cursor = dialect.sqlToQuery(
			buildSearchPredicates({
				orgId: "org_test",
				env: AppEnv.Live,
				search: "",
			}).whereRaw,
		);
		const list = dialect.sqlToQuery(getCustomerListFilterSql({ search: " " }));
		expect(cursor.sql).not.toContain("ILIKE");
		expect(cursor.params).toEqual(["org_test", AppEnv.Live]);
		expect(list.sql).not.toContain("ILIKE");
		expect(list.params).toEqual([]);
	});
});
