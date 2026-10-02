import { expect, test } from "bun:test";
import type { Feature, ProcessorItemPrice } from "@autumn/shared";
import { reviewPlanPrice } from "@/components/forms/create-schedule/utils/review/reviewPlanPrice";
import { monthlyPrice } from "./reviewFixtures";

const features = [
	{
		id: "seats",
		name: "Seats",
		display: { singular: "seat", plural: "seats" },
	},
	{ id: "credits", name: "Credits" },
] as Feature[];

const tieredPrice: ProcessorItemPrice = {
	...monthlyPrice(0),
	unit_amount: null,
	tiers_mode: "graduated",
	tiers: [
		{ up_to: 2, unit_amount: 0, flat_amount: 0 },
		{ up_to: null, unit_amount: 5, flat_amount: 0 },
	],
	units_per_quantity: 100,
};

test("a plan with a base price shows it per interval", () => {
	expect(
		reviewPlanPrice({
			prices: [
				{ feature_id: null, price: monthlyPrice(20) },
				{ feature_id: "seats", price: monthlyPrice(10) },
			],
			features,
		}),
	).toEqual({ amount: "$20", suffix: "/mo" });
});

test("a plan with no base price shows its first feature's unit price", () => {
	expect(
		reviewPlanPrice({
			prices: [{ feature_id: "seats", price: monthlyPrice(10) }],
			features,
		}),
	).toEqual({ amount: "$10", suffix: "/seat" });
});

test("tiered and multi-feature plans say so, from the first paid tier", () => {
	expect(
		reviewPlanPrice({
			prices: [
				{ feature_id: "credits", price: tieredPrice },
				{ feature_id: "seats", price: monthlyPrice(10) },
			],
			features,
		}),
	).toEqual({ amount: "From $5", suffix: "/100 credits +1" });
});

test("a plan without prices is free", () => {
	expect(reviewPlanPrice({ prices: [], features })).toEqual({
		amount: "Free",
	});
});
