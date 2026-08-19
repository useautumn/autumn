import { expect, test } from "bun:test";
import {
	type CreateFeature,
	type CreditSchemaItem,
	FeatureType,
	Infinite,
} from "@autumn/shared";
import { validateCreditSystem } from "./validateCreditSystem";

const creditSystem = (schema: CreditSchemaItem[]): CreateFeature =>
	({
		id: "credits",
		name: "Credits",
		type: FeatureType.CreditSystem,
		config: { schema },
	}) as CreateFeature;

test("a flat rate card with billing units and a zero cost is valid", () => {
	expect(
		validateCreditSystem(
			creditSystem([
				{ metered_feature_id: "tokens", feature_amount: 100, credit_amount: 0 },
			]),
		),
	).toBeNull();
});

test("billing units must be positive", () => {
	expect(
		validateCreditSystem(
			creditSystem([
				{ metered_feature_id: "tokens", feature_amount: 0, credit_amount: 1 },
			]),
		),
	).toBe("Pricing units must be greater than 0");
});

test("credit costs cannot be negative", () => {
	expect(
		validateCreditSystem(
			creditSystem([
				{ metered_feature_id: "tokens", feature_amount: 1, credit_amount: -1 },
			]),
		),
	).toBe("Credit cost cannot be negative");
});

test("a graduated rate card with increasing boundaries is valid", () => {
	expect(
		validateCreditSystem(
			creditSystem([
				{
					metered_feature_id: "tokens",
					feature_amount: 100,
					tier_behavior: "graduated",
					tiers: [
						{ to: 10_000, credit_amount: 1 },
						{ to: 50_000, credit_amount: 0.8 },
						{ to: Infinite, credit_amount: 0.5 },
					],
				},
			]),
		),
	).toBeNull();
});

test("tier boundaries must strictly increase", () => {
	expect(
		validateCreditSystem(
			creditSystem([
				{
					metered_feature_id: "tokens",
					feature_amount: 1,
					tier_behavior: "graduated",
					tiers: [
						{ to: 10_000, credit_amount: 1 },
						{ to: 10_000, credit_amount: 0.8 },
						{ to: Infinite, credit_amount: 0.5 },
					],
				},
			]),
		),
	).toBe("Tier limits must increase");
});

test("the last tier must be unbounded", () => {
	expect(
		validateCreditSystem(
			creditSystem([
				{
					metered_feature_id: "tokens",
					feature_amount: 1,
					tier_behavior: "graduated",
					tiers: [{ to: 10_000, credit_amount: 1 }],
				},
			]),
		),
	).toBe("The last tier must be unbounded");
});

test("only the last tier may be unbounded", () => {
	expect(
		validateCreditSystem(
			creditSystem([
				{
					metered_feature_id: "tokens",
					feature_amount: 1,
					tier_behavior: "graduated",
					tiers: [
						{ to: Infinite, credit_amount: 1 },
						{ to: Infinite, credit_amount: 0.5 },
					],
				},
			]),
		),
	).toBe("Only the last tier can be unbounded");
});

test("flat rates cannot contain tier fields", () => {
	const mixedItem = {
		metered_feature_id: "tokens",
		feature_amount: 1,
		credit_amount: 1,
		tiers: [{ to: Infinite, credit_amount: 1 }],
	} as unknown as CreditSchemaItem;

	expect(validateCreditSystem(creditSystem([mixedItem]))).toBe(
		"Flat rates cannot include tiers",
	);
});

test("graduated rates cannot contain a flat credit cost", () => {
	const mixedItem = {
		metered_feature_id: "tokens",
		feature_amount: 1,
		credit_amount: 1,
		tier_behavior: "graduated",
		tiers: [{ to: Infinite, credit_amount: 1 }],
	} as unknown as CreditSchemaItem;

	expect(validateCreditSystem(creditSystem([mixedItem]))).toBe(
		"Graduated rates cannot include a flat credit cost",
	);
});
