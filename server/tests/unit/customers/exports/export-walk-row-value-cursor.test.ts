/**
 * A Mobbin export died 1,930 rows from the end on "Query read timeout". The
 * page walk ordered by internal_id alone, so Postgres chose customers_pkey and
 * filtered org_id afterwards — scanning 7.1M rows of other orgs to return 500.
 *
 * Verified on the prod replica at the cursor depth that failed:
 *   before  5,870ms  6,434,208 buffers  Rows Removed by Filter: 7,137,007
 *   after     569ms     49,715 buffers  idx_customers_org_env_internal_id
 *
 * Red (before):  the walk compares internal_id alone and orders by it alone.
 * Green (after): the cursor is a row value over (org_id, env, internal_id) and
 *                the ordering matches, so the org index serves the whole walk.
 */

import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(
	join(
		import.meta.dir,
		"../../../../src/internal/customers/exports/queries/getCustomerExportScalars.ts",
	),
	"utf8",
);

describe("customer export page walk", () => {
	it("compares the cursor as a row value over the org index's columns", () => {
		expect(source).toContain(
			"(${customers.org_id}, ${customers.env}, ${customers.internal_id}) < (${orgId}, ${env}, ${afterInternalId})",
		);
	});

	it("orders by the org index's columns so the planner can use it", () => {
		const orderBy = source.slice(source.indexOf(".orderBy("));

		for (const column of ["org_id", "env", "internal_id"]) {
			expect(orderBy).toContain(`desc(customers.${column})`);
		}
	});

	it("no longer compares internal_id alone for the cursor", () => {
		expect(source).not.toContain("lt(customers.internal_id, afterInternalId)");
	});
});
