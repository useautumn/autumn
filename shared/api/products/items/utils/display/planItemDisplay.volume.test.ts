import { describe, expect, test } from "bun:test";
import type { CreatePlanItemParamsV1Input } from "@api/products/items/crud/createPlanItemParamsV1";
import { getPlanItemDisplay } from "./planItemDisplay";

const features = [
	{
		id: "messages",
		name: "Messages",
		display: { singular: "message", plural: "messages" },
	},
];

const tieredItem = ({
	tierBehavior,
	included = 0,
	tiers = [
		{ to: 200, amount: 1 },
		{ to: "inf", amount: 0.5 },
	],
}: {
	tierBehavior: "graduated" | "volume";
	included?: number;
	tiers?: { to: number | "inf"; amount?: number; flat_amount?: number }[];
}) =>
	({
		feature_id: "messages",
		included,
		price: {
			tiers,
			tier_behavior: tierBehavior,
			interval: "month",
			billing_method: "usage_based",
		},
	}) as CreatePlanItemParamsV1Input;

const display = (item: CreatePlanItemParamsV1Input) =>
	getPlanItemDisplay({ currency: "usd", features, item });

describe("getPlanItemDisplay: volume tiers", () => {
	test("graduated tiers read as before", () => {
		expect(display(tieredItem({ tierBehavior: "graduated" })).primaryText).toBe(
			"$1 - $0.5 per message per month",
		);
	});

	test("volume tiers append the rate rule after the interval", () => {
		expect(
			display(tieredItem({ tierBehavior: "volume", included: 100 })),
		).toMatchObject({
			primaryText: "100 messages",
			secondaryText:
				"then $1 - $0.5 per message per month (volume: past 100, all units at the reached tier's rate)",
		});
	});

	test("mixed tiers keep per-unit rates and list each tier's flat fee", () => {
		const item = tieredItem({
			tierBehavior: "volume",
			tiers: [
				{ to: 200, amount: 1, flat_amount: 5 },
				{ to: "inf", amount: 0.5 },
			],
		});
		expect(display(item)).toMatchObject({
			primaryText:
				"$1 - $0.5 per message per month (volume: all units at the reached tier's rate plus its flat fee)",
			details: ["1 - 200: $1 + $5 flat", "201+: $0.5"],
		});
	});

	test("flat-only tiers show the flat fee range", () => {
		const item = tieredItem({
			tierBehavior: "volume",
			tiers: [
				{ to: 200, flat_amount: 5 },
				{ to: "inf", flat_amount: 20 },
			],
		});
		expect(display(item).primaryText).toBe(
			"$5 - $20 for messages per month (volume: the reached tier's flat fee)",
		);
	});
});
