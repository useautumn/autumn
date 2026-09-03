/**
 * A hidden plan's RevenueCat mapping could never be released.
 *
 * `hasUnsupportedUsagePrice` drops metered plans from the mapping sheet, and
 * the sheet built both its rows and its save payload from that filtered list.
 * A plan that gained a metered item after being mapped therefore vanished while
 * still owning its RevenueCat ids — and because catalogV2 rejects an id claimed
 * by two plans (`assertRevenueCatIdsUnclaimed`), those ids could never be
 * reassigned and there was no row to release them from.
 *
 * Red (pre-fix):  `listRevenueCatProducts` did not exist; the sheet filtered
 *                 every unsupported plan out unconditionally, mapped or not.
 * Green (post-fix): the filter governs CREATING mappings, not rendering them —
 *                 an unsupported plan that still owns ids stays listed (flagged
 *                 `unsupported`, so the row goes read-only for adds), and
 *                 clearing its ids sends `products: []`, which
 *                 `executeRevenueCatMappings` reads as "delete the row".
 *
 * The React wiring (badge, hidden add-select, disabled packs input) is not
 * covered here — only the two pure decisions the fix turns on.
 */

import { expect, test } from "bun:test";
import { type ProductV2, UsageModel } from "@autumn/shared";
import { toCatalogParams } from "@/hooks/queries/revcat/useRCMappings";
import { listRevenueCatProducts } from "@/views/developer/configure-revenuecat/components/RevenueCatMappingSheet";

const buildProduct = ({
	id,
	usageModel,
}: {
	id: string;
	usageModel?: UsageModel;
}) =>
	({
		id,
		name: id,
		version: 1,
		items: [
			{ price: 20 },
			...(usageModel
				? [{ feature_id: "credits", price: 1, usage_model: usageModel }]
				: []),
		],
	}) as ProductV2;

const proPlan = buildProduct({ id: "pro" });
const prepaidPlan = buildProduct({
	id: "packs",
	usageModel: UsageModel.Prepaid,
});
const meteredPlan = buildProduct({
	id: "usage",
	usageModel: UsageModel.PayPerUse,
});

test("plans without a metered price are always listed and mappable", () => {
	const listed = listRevenueCatProducts({
		products: [proPlan, prepaidPlan],
		existingMappings: [],
	});

	expect(listed.map(({ product }) => product.id)).toEqual(["pro", "packs"]);
	expect(listed.every(({ unsupported }) => !unsupported)).toBe(true);
});

test("a metered plan with no mapping stays hidden — nothing to release", () => {
	const listed = listRevenueCatProducts({
		products: [proPlan, meteredPlan],
		existingMappings: [
			{ autumn_product_id: "usage", revenuecat_product_ids: [] },
		],
	});

	expect(listed.map(({ product }) => product.id)).toEqual(["pro"]);
});

test("a metered plan still owning RevenueCat ids is listed as unsupported", () => {
	const listed = listRevenueCatProducts({
		products: [proPlan, meteredPlan],
		existingMappings: [
			{
				autumn_product_id: "usage",
				revenuecat_product_ids: ["rc_credits_100"],
			},
		],
	});

	expect(listed.map(({ product }) => product.id)).toEqual(["pro", "usage"]);
	expect(
		listed.find(({ product }) => product.id === "usage")?.unsupported,
	).toBe(true);
});

test("clearing a listed plan's ids sends the empty products array that deletes the row", () => {
	const params = toCatalogParams([
		{ autumn_product_id: "usage", revenuecat_product_ids: [] },
		{
			autumn_product_id: "pro",
			revenuecat_product_ids: ["rc_credits_100"],
		},
	]);

	expect(params.plans).toEqual([
		{
			plan_id: "usage",
			processors: { revenuecat: { products: [] } },
		},
		{
			plan_id: "pro",
			processors: {
				revenuecat: { products: [{ product_id: "rc_credits_100" }] },
			},
		},
	]);
});

test("one plan carries many RevenueCat ids, each with its own grant", () => {
	const params = toCatalogParams([
		{
			autumn_product_id: "packs",
			revenuecat_product_ids: ["rc_credits_100", "rc_credits_500"],
			feature_quantities: {
				rc_credits_100: [{ feature_id: "credits", quantity: 100 }],
				rc_credits_500: [{ feature_id: "credits", quantity: 500 }],
			},
		},
	]);

	expect(params.plans?.[0]?.processors?.revenuecat?.products).toEqual([
		{
			product_id: "rc_credits_100",
			feature_quantities: [{ feature_id: "credits", quantity: 100 }],
		},
		{
			product_id: "rc_credits_500",
			feature_quantities: [{ feature_id: "credits", quantity: 500 }],
		},
	]);
});
