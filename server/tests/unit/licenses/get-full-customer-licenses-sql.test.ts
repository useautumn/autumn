import { afterEach, describe, expect, test } from "bun:test";
import { AppEnv, customerLicenses } from "@autumn/shared";
import type { SQL } from "drizzle-orm";
import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

const preparedCalls: { query: SQL; label: string }[] = [];

await mockModuleWithRestore("@/db/executePrepared.js", () => ({
	executePrepared: async (args: { query: SQL; label: string }) => {
		preparedCalls.push(args);
		return [];
	},
}));

const { getFullCustomerLicenses } = await import(
	"@/internal/licenses/repos/customerLicenseRepo/getFullCustomerLicenses.js"
);

const dialect = new PgDialect();

const loadLicenses = (customerId: string) =>
	getFullCustomerLicenses({
		db: {} as DrizzleCli,
		orgId: "org_123",
		env: AppEnv.Live,
		customerId,
	});

afterEach(() => {
	preparedCalls.length = 0;
});

describe("getFullCustomerLicenses", () => {
	test('customer_licenses has a COLLATE "C" index for the customers.internal_id join', () => {
		const index = getTableConfig(customerLicenses).indexes.find(
			({ config }) =>
				config.name === "idx_customer_licenses_internal_customer_id_c",
		);
		const [column] = index?.config.columns ?? [];

		expect(index?.config.concurrently).toBe(true);
		expect(dialect.sqlToQuery(column as SQL).sql).toBe(
			'"customer_licenses"."internal_customer_id" COLLATE "C"',
		);
	});

	test("runs as one stable prepared statement across customers", async () => {
		await loadLicenses("customer_123");
		await loadLicenses("customer_456");

		const [first, second] = preparedCalls.map(({ query, label }) => ({
			label,
			...dialect.sqlToQuery(query),
		}));
		expect(first.label).toBe("getFullCustomerLicenses");
		expect(second.sql).toBe(first.sql);
		expect(second.params).not.toEqual(first.params);
	});
});
