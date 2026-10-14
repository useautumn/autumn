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
