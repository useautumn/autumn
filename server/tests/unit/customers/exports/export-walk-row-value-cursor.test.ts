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
import { AppEnv } from "@autumn/shared";
import { drizzle } from "drizzle-orm/node-postgres";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { buildCustomerExportScalarsQuery } from "@/internal/customers/exports/queries/getCustomerExportScalars.js";

const sqlFor = ({ afterInternalId }: { afterInternalId: string | null }) =>
	buildCustomerExportScalarsQuery({
		db: drizzle.mock() as unknown as DrizzleCli,
		orgId: "org_1",
		env: AppEnv.Live,
		snapshot: { search: null, filters: [] } as never,
		upperBoundInternalId: "cus_zzz",
		createdAtCutoff: 1_790_000_000_000,
		afterInternalId,
		limit: 2000,
	}).toSQL().sql;

const ROW_VALUE_CURSOR =
	'("customers"."org_id", "customers"."env", "customers"."internal_id") <';

describe("customer export page walk", () => {
	it("orders by the org index's columns so the planner can use it", () => {
		expect(sqlFor({ afterInternalId: null })).toContain(
			'order by "customers"."org_id" desc, "customers"."env" desc, "customers"."internal_id" desc',
		);
	});

	it("compares the cursor as a row value, not internal_id alone", () => {
		expect(sqlFor({ afterInternalId: "cus_mid" })).toContain(ROW_VALUE_CURSOR);
	});

	it("omits the cursor comparison on the first page", () => {
		expect(sqlFor({ afterInternalId: null })).not.toContain(ROW_VALUE_CURSOR);
	});
});
