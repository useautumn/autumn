import { describe, expect, test } from "bun:test";
import { ceBalanceTotalsSql } from "../src/buildCeBalanceTotals.js";
import { CE_LAKE_TABLES, getCeLakeTables } from "../src/ceLakeTables.js";

const meta = (table: string) =>
	`s3://autumn-lake-prod-us-east-2/internal/${table}/warehouse/metadata/00001-abc.metadata.json`;

const otherMetas = {
	entMeta: meta("entitlements"),
	featureMeta: meta("features"),
	cpMeta: meta("customer_products"),
};

describe("getCeLakeTables", () => {
	test("defaults to the 8 RisingWave shard tables", () => {
		expect(getCeLakeTables({ override: "" })).toEqual(CE_LAKE_TABLES);
		expect(CE_LAKE_TABLES).toEqual(
			Array.from(
				{ length: 8 },
				(_, shard) => `customer_entitlements_s${shard}`,
			),
		);
	});

	test("parses a comma-separated override", () => {
		expect(getCeLakeTables({ override: " customer_entitlements , " })).toEqual([
			"customer_entitlements",
		]);
	});

	test("rejects an override with no table names", () => {
		expect(() => getCeLakeTables({ override: " , " })).toThrow();
	});
});

describe("ducklake ce_balance_totals build", () => {
	test("a single location scans once with no UNION ALL", () => {
		const ceMeta = meta("customer_entitlements");
		const query = ceBalanceTotalsSql({ ceMetas: [ceMeta], ...otherMetas });

		expect(query).toContain(
			`\n\tWITH b AS (\n\t\tSELECT\n\t\t\tinternal_customer_id,`,
		);
		expect(query).toContain(
			`\t\tFROM iceberg_scan('${ceMeta}')\n\t),\n\ta AS (`,
		);
		expect(query).not.toContain("UNION ALL");
	});

	test("unions every shard exactly once", () => {
		const ceMetas = CE_LAKE_TABLES.map(meta);
		const query = ceBalanceTotalsSql({ ceMetas, ...otherMetas });

		expect(query.match(/UNION ALL/g)).toHaveLength(7);
		for (const ceMeta of ceMetas) {
			expect(query).toContain(`FROM iceberg_scan('${ceMeta}')`);
		}
		expect(query.match(/iceberg_scan\(/g)).toHaveLength(8 + 3);
	});
});
