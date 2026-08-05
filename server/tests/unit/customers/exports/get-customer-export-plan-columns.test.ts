import { describe, expect, it } from "bun:test";
import {
	bucketCustomerExportPlanRows,
	type CustomerExportPlanRow,
} from "@/internal/customers/exports/queries/getCustomerExportPlanColumns.js";

const buildRow = (
	overrides: Partial<CustomerExportPlanRow> = {},
): CustomerExportPlanRow => ({
	internal_customer_id: "cus_internal_1",
	product_id: "pro",
	internal_product_id: "prod_internal_pro",
	is_license: false,
	...overrides,
});

describe("bucketCustomerExportPlanRows", () => {
	it("puts recurring and free plans in subscriptions", () => {
		const columns = bucketCustomerExportPlanRows({
			rows: [
				buildRow({ product_id: "pro", internal_product_id: "prod_pro" }),
				buildRow({ product_id: "free", internal_product_id: "prod_free" }),
			],
			oneOffInternalProductIds: new Set<string>(),
		});

		expect(columns.get("cus_internal_1")).toEqual({
			subscriptions: ["free", "pro"],
			purchases: [],
			licenses: [],
		});
	});

	it("puts one-off plans in purchases", () => {
		const columns = bucketCustomerExportPlanRows({
			rows: [
				buildRow({ product_id: "pro", internal_product_id: "prod_pro" }),
				buildRow({
					product_id: "credits",
					internal_product_id: "prod_credits",
				}),
			],
			oneOffInternalProductIds: new Set(["prod_credits"]),
		});

		expect(columns.get("cus_internal_1")).toEqual({
			subscriptions: ["pro"],
			purchases: ["credits"],
			licenses: [],
		});
	});

	it("puts license rows in licenses regardless of pricing", () => {
		const columns = bucketCustomerExportPlanRows({
			rows: [
				buildRow({
					product_id: "seat",
					internal_product_id: "prod_seat",
					is_license: true,
				}),
			],
			oneOffInternalProductIds: new Set(["prod_seat"]),
		});

		expect(columns.get("cus_internal_1")).toEqual({
			subscriptions: [],
			purchases: [],
			licenses: ["seat"],
		});
	});

	it("sorts and dedupes each cell", () => {
		const columns = bucketCustomerExportPlanRows({
			rows: [
				buildRow({ product_id: "zeta", internal_product_id: "prod_zeta" }),
				buildRow({ product_id: "alpha", internal_product_id: "prod_alpha" }),
				buildRow({ product_id: "alpha", internal_product_id: "prod_alpha" }),
			],
			oneOffInternalProductIds: new Set<string>(),
		});

		expect(columns.get("cus_internal_1")?.subscriptions).toEqual([
			"alpha",
			"zeta",
		]);
	});

	it("keeps customers separate and omits ones with no rows", () => {
		const columns = bucketCustomerExportPlanRows({
			rows: [
				buildRow({ internal_customer_id: "cus_a", product_id: "pro" }),
				buildRow({ internal_customer_id: "cus_b", product_id: "team" }),
			],
			oneOffInternalProductIds: new Set<string>(),
		});

		expect(columns.get("cus_a")?.subscriptions).toEqual(["pro"]);
		expect(columns.get("cus_b")?.subscriptions).toEqual(["team"]);
		expect(columns.get("cus_c")).toBeUndefined();
	});

	it("skips rows whose product has no public id", () => {
		const columns = bucketCustomerExportPlanRows({
			rows: [buildRow({ product_id: null })],
			oneOffInternalProductIds: new Set<string>(),
		});

		expect(columns.size).toBe(0);
	});
});
