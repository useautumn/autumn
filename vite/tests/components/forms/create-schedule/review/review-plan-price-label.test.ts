import { expect, test } from "bun:test";
import {
	type Feature,
	type ProductItem,
	ProductItemInterval,
	type ProductV2,
} from "@autumn/shared";
import { reviewPlanPriceLabel } from "@/components/forms/create-schedule/utils/review/reviewPlanPriceLabel";

const features = [
	{
		id: "seats",
		name: "Seats",
		display: { singular: "seat", plural: "seats" },
	},
	{ id: "credits", name: "Credits" },
] as Feature[];

const plan = (items: Partial<ProductItem>[]) =>
	({
		id: "usage-plan",
		name: "Usage plan",
		is_add_on: false,
		items,
	}) as unknown as ProductV2;

test("a plan with no base price shows its first feature's unit price", () => {
	expect(
		reviewPlanPriceLabel({
			product: plan([
				{ feature_id: "seats", price: 10, interval: ProductItemInterval.Month },
			]),
			features,
			currency: "usd",
		}),
	).toBe("$10/seat");
});

test("tiered and multi-feature plans say so", () => {
	expect(
		reviewPlanPriceLabel({
			product: plan([
				{
					feature_id: "credits",
					billing_units: 100,
					tiers: [
						{ to: 1000, amount: 5 },
						{ to: "inf", amount: 3 },
					],
					interval: ProductItemInterval.Month,
				},
				{ feature_id: "seats", price: 10, interval: ProductItemInterval.Month },
			] as Partial<ProductItem>[]),
			features,
			currency: "usd",
		}),
	).toBe("From $5/100 credits +1");
});
