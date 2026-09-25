import { describe, expect, test } from "bun:test";
import { CE_BALANCES_CACHE_PROJECTION } from "@autumn/shared";
import {
	CE_LAKE_TABLES,
	ceBalanceTotalsSql,
} from "@/external/motherduck/refreshCeBalancesCache.js";

const META =
	"s3://autumn-lake-prod-us-east-2/internal/customer_entitlements/warehouse/internal/customer_entitlements/metadata/08982-abc.metadata.json";

const shardMeta = (shard: number) =>
	`s3://autumn-lake-prod-us-east-2/internal/customer_entitlements_s${shard}/warehouse/internal/customer_entitlements_s${shard}/metadata/00001-abc.metadata.json`;

describe("ce_balance_totals build", () => {
	test("aggregates straight off the lake, with no materialised intermediate", () => {
		const query = ceBalanceTotalsSql({ ceMetadataLocations: [META] });
		const normalized = query.replace(/\s+/g, " ").trim();

		expect(normalized).toContain(`WITH b AS ( SELECT`);
		expect(normalized).toContain(`FROM iceberg_scan('${META}') )`);
		expect(normalized).toContain("FROM b LEFT JOIN main.ent_allowances");
		// The intermediate was 114M rows rewritten per run and read by nothing
		// else; reintroducing it silently restores ~450GB/day of billed writes.
		expect(normalized).not.toContain("main.ce_balances");
	});

	test("a single location keeps the pre-shard CTE exactly", () => {
		const query = ceBalanceTotalsSql({ ceMetadataLocations: [META] });

		expect(query).toContain(`
	WITH b AS (
		SELECT ${CE_BALANCES_CACHE_PROJECTION}
		FROM iceberg_scan('${META}')
	)
	SELECT`);
		expect(query).not.toContain("UNION ALL");
	});

	test("unions every shard exactly once", () => {
		const locations = Array.from({ length: 8 }, (_, shard) => shardMeta(shard));
		const query = ceBalanceTotalsSql({ ceMetadataLocations: locations });

		expect(query.match(/UNION ALL/g)).toHaveLength(7);
		expect(query.match(/iceberg_scan\(/g)).toHaveLength(8);
		for (const location of locations) {
			expect(query).toContain(`FROM iceberg_scan('${location}')`);
		}
		expect(query.replace(/\s+/g, " ")).toContain(
			"FROM b LEFT JOIN main.ent_allowances",
		);
	});

	test("defaults to the 8 RisingWave shard tables", () => {
		expect(CE_LAKE_TABLES).toEqual(
			Array.from(
				{ length: 8 },
				(_, shard) => `customer_entitlements_s${shard}`,
			),
		);
	});

	test("writes the live table by default and a shadow table on request", () => {
		expect(ceBalanceTotalsSql({ ceMetadataLocations: [META] })).toContain(
			"CREATE OR REPLACE TABLE main.ce_balance_totals AS",
		);
		expect(
			ceBalanceTotalsSql({
				ceMetadataLocations: [META],
				totalsTable: "ce_balance_totals__shadow",
			}),
		).toContain("CREATE OR REPLACE TABLE main.ce_balance_totals__shadow AS");
	});
});
