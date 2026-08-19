import { expect, test } from "bun:test";
import { type CreditSchemaItem, Infinite } from "@autumn/shared";
import {
	addTier,
	creditSchemaToApi,
	removeTier,
	setRateType,
	updateTier,
} from "./creditSchemaUtils";

const flat: CreditSchemaItem = {
	metered_feature_id: "tokens",
	feature_amount: 100,
	credit_amount: 1,
};

const graduated: CreditSchemaItem = {
	metered_feature_id: "tokens",
	feature_amount: 100,
	tier_behavior: "graduated",
	tiers: [
		{ to: 10_000, credit_amount: 1 },
		{ to: Infinite, credit_amount: 0.5 },
	],
};

test("switching to graduated seeds one infinite tier from the flat cost", () => {
	const result = setRateType({ item: flat, rateType: "graduated" });

	expect(result).toEqual({
		metered_feature_id: "tokens",
		feature_amount: 100,
		tier_behavior: "graduated",
		tiers: [{ to: Infinite, credit_amount: 1 }],
	});
	expect("credit_amount" in result).toBe(false);
});

test("switching to flat drops tiers and keeps the first tier's cost", () => {
	const result = setRateType({ item: graduated, rateType: "flat" });

	expect(result).toEqual({
		metered_feature_id: "tokens",
		feature_amount: 100,
		credit_amount: 1,
	});
	expect("tiers" in result).toBe(false);
	expect("tier_behavior" in result).toBe(false);
});

test("switching to the current rate type is a no-op", () => {
	expect(setRateType({ item: flat, rateType: "flat" })).toBe(flat);
	expect(setRateType({ item: graduated, rateType: "graduated" })).toBe(
		graduated,
	);
});

test("adding a tier bounds the previously infinite tier and appends a new one", () => {
	const result = addTier(graduated);

	expect(result.tiers).toEqual([
		{ to: 10_000, credit_amount: 1 },
		{ to: 10_100, credit_amount: 0.5 },
		{ to: Infinite, credit_amount: 0 },
	]);
});

test("removing a tier re-anchors the final tier to infinity", () => {
	const result = removeTier({ item: addTier(graduated), index: 1 });

	expect(result.tiers).toEqual([
		{ to: 10_000, credit_amount: 1 },
		{ to: Infinite, credit_amount: 0 },
	]);
});

test("removing the only tier is refused", () => {
	const single = setRateType({ item: flat, rateType: "graduated" });
	expect(removeTier({ item: single, index: 0 })).toBe(single);
});

test("the final tier's boundary cannot be edited away from infinity", () => {
	const result = updateTier({ item: graduated, index: 1, patch: { to: 50 } });
	expect(result.tiers[1].to).toBe(Infinite);
});

test("flat items serialize billing units and credit cost", () => {
	expect(creditSchemaToApi([flat])).toEqual([
		{ metered_feature_id: "tokens", billing_units: 100, credit_cost: 1 },
	]);
});

test("graduated items serialize every tier without dropping the union fields", () => {
	expect(creditSchemaToApi([graduated])).toEqual([
		{
			metered_feature_id: "tokens",
			billing_units: 100,
			tier_behavior: "graduated",
			tiers: [
				{ to: 10_000, credit_cost: 1 },
				{ to: Infinite, credit_cost: 0.5 },
			],
		},
	]);
});

test("missing billing units serialize as one", () => {
	const [item] = creditSchemaToApi([
		{ metered_feature_id: "tokens", credit_amount: 2 },
	]);
	expect(item.billing_units).toBe(1);
});

test("invalid zero billing units are preserved for validation", () => {
	const [item] = creditSchemaToApi([
		{ metered_feature_id: "tokens", feature_amount: 0, credit_amount: 2 },
	]);
	expect(item.billing_units).toBe(0);
});
