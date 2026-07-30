import { expect, test } from "bun:test";
import type { ProductV2 } from "@autumn/shared";
import {
	getProductGroupKey,
	getUsedProductGroupKeys,
} from "@/components/forms/shared/utils/planGroupUtils";

const product = (id: string, group: string | null = null, isAddOn = false) =>
	({
		id,
		group,
		is_add_on: isAddOn,
		items: [],
	}) as unknown as ProductV2;

const products = [
	product("pro", "tier"),
	product("premium", "tier"),
	product("starter"),
	product("growth"),
	product("addon", null, true),
];

test("group key matches create schedule grouping", () => {
	expect(getProductGroupKey({ productId: "pro", products })).toBe("tier");
	expect(getProductGroupKey({ productId: "starter", products })).toBe("");
	expect(getProductGroupKey({ productId: "growth", products })).toBe("");
	expect(getProductGroupKey({ productId: "addon", products })).toBe("addon");
});

test("unknown product ids key to themselves", () => {
	expect(getProductGroupKey({ productId: "missing", products })).toBe(
		"missing",
	);
});

test("used keys collapse same-group products into one entry", () => {
	expect(
		getUsedProductGroupKeys({
			productIds: ["pro", "premium", "starter", "growth"],
			products,
		}),
	).toEqual(new Set(["tier", ""]));
});

test("used keys ignore empty selections", () => {
	expect(
		getUsedProductGroupKeys({ productIds: ["pro", "", "addon"], products }),
	).toEqual(new Set(["tier", "addon"]));
});
