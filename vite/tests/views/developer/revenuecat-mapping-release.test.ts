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
