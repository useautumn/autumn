/**
 * A Mobbin export kept stalling as it neared the end. Two cursor shapes each
 * fail, at opposite ends of the walk:
 *
 *   internal_id alone -> seeks, but on the last pages the planner switches to
 *     customers_pkey and filters 7.1M other orgs' rows (5,960ms, timeout).
 *   ROW(org_id, env, internal_id) < ROW(...) alone -> holds the org index, but
 *     a row value cannot seek, so each page rescans the prefix already walked.
 *
 * Carrying both keeps the org index AND the seek. Prod replica, 3.08M rows:
 *
 *   cursor depth   row value only      both terms
 *   100k            19ms   3,952       ~2ms    ~700
 *   1M             126ms  18,394       ~2ms    ~700
 *   2M             236ms  33,487       ~2ms    ~700
 *   3.078M (end)   383ms  50,032       1.4ms    694
 *
 * internal_id alone at that end cursor: 5,960ms / 6,428,415 buffers.
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

const strictInternalIdBounds = (sql: string) =>
	sql.match(/"customers"\."internal_id" < \$/g) ?? [];

describe("customer export page walk", () => {
	it("keeps the planner on the org index with a row-value cursor", () => {
		expect(sqlFor({ afterInternalId: "cus_mid" })).toContain(ROW_VALUE_CURSOR);
	});

	it("also bounds internal_id directly so the index can seek", () => {
		expect(
			strictInternalIdBounds(sqlFor({ afterInternalId: "cus_mid" })),
		).toHaveLength(1);
	});

	it("orders by the org index's columns so the planner can use it", () => {
		expect(sqlFor({ afterInternalId: null })).toContain(
			'order by "customers"."org_id" desc, "customers"."env" desc, "customers"."internal_id" desc',
		);
	});

	it("omits both cursor comparisons on the first page", () => {
		const firstPage = sqlFor({ afterInternalId: null });

		expect(firstPage).not.toContain(ROW_VALUE_CURSOR);
		expect(strictInternalIdBounds(firstPage)).toHaveLength(0);
	});
});
