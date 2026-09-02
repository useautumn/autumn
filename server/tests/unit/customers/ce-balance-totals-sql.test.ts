import { describe, expect, test } from "bun:test";
import { ceBalanceTotalsSql } from "@/external/motherduck/refreshCeBalancesCache.js";

const META =
	"s3://autumn-lake-prod-us-east-2/internal/customer_entitlements/warehouse/internal/customer_entitlements/metadata/08982-abc.metadata.json";

describe("ce_balance_totals build", () => {
	test("aggregates straight off the lake, with no materialised intermediate", () => {
		const query = ceBalanceTotalsSql({ ceMetadataLocation: META });
		const normalized = query.replace(/\s+/g, " ").trim();

		expect(normalized).toContain(`WITH b AS ( SELECT`);
		expect(normalized).toContain(`FROM iceberg_scan('${META}') )`);
		expect(normalized).toContain("FROM b LEFT JOIN main.ent_allowances");
		// The intermediate was 114M rows rewritten per run and read by nothing
		// else; reintroducing it silently restores ~450GB/day of billed writes.
		expect(normalized).not.toContain("main.ce_balances");
	});

	test("writes the live table by default and a shadow table on request", () => {
		expect(ceBalanceTotalsSql({ ceMetadataLocation: META })).toContain(
			"CREATE OR REPLACE TABLE main.ce_balance_totals AS",
		);
		expect(
			ceBalanceTotalsSql({
				ceMetadataLocation: META,
				totalsTable: "ce_balance_totals__shadow",
			}),
		).toContain("CREATE OR REPLACE TABLE main.ce_balance_totals__shadow AS");
	});
});
