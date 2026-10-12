import { describe, expect, test } from "bun:test";
import { customerLicenses } from "@autumn/shared";
import type { SQL } from "drizzle-orm";
import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";

const dialect = new PgDialect();

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
});
