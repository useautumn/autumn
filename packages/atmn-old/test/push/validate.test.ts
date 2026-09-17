import { expect, test } from "bun:test";
import { item } from "../../src/compose/builders/builderFunctions.js";
import type { Plan } from "../../src/compose/models/variantModels.js";
import { validateConfig } from "../../src/commands/push/validate.js";

test("validateConfig rejects plan items that reference unexported features", () => {
	const result = validateConfig(
		[{ id: "messages", name: "Messages", type: "metered", consumable: true }],
		[
			{
				id: "pro",
				name: "Pro",
				items: [{ featureId: "admin" }],
				variants: [
					{
						id: "pro_annual",
						name: "Pro Annual",
						customize: {
							addItems: [{ featureId: "analytics" }],
							removeItems: [{ featureId: "seats" }],
						},
					},
				],
			},
		],
	);

	expect(result.valid).toBe(false);
	expect(result.errors.map((error) => error.message)).toEqual(
		expect.arrayContaining([
			`Feature "admin" is referenced by this item but is not exported from your config.`,
			`Feature "analytics" is referenced by this item but is not exported from your config.`,
			`Feature "seats" is referenced here but is not exported from your config.`,
		]),
	);
});

test("validateConfig rejects invalid license configuration and cycles", () => {
	const result = validateConfig(
		[],
		[
			{
				id: "a",
				name: "A",
				licenses: [
					{ licensePlanId: "a" },
					{ licensePlanId: "b" },
					{ licensePlanId: "b" },
					{ licensePlanId: "missing" },
				],
			},
			{ id: "b", name: "B", licenses: [{ licensePlanId: "a" }] },
		],
	);

	expect(result.valid).toBe(false);
	expect(result.errors.map((error) => error.message).join("\n")).toContain(
		"Plan dependency cycle",
	);
	expect(result.errors.map((error) => error.message)).toEqual(
		expect.arrayContaining([
			"A plan cannot license itself.",
			'Duplicate license link "b".',
			'License plan "missing" is not exported from your config.',
		]),
	);
});

test("validateConfig accepts separate reset and billing intervals for prepaid items", () => {
	const plan = {
		id: "scale-annual",
		name: "Scale Annual",
		items: [
			item({
				featureId: "credits",
				included: 1_000,
				reset: { interval: "month" },
				price: {
					amount: 100,
					interval: "year",
					billingMethod: "prepaid",
				},
			}),
		],
	} as const satisfies Plan;

	const result = validateConfig(
		[{ id: "credits", name: "Credits", type: "metered", consumable: true }],
		[plan],
	);

	expect(result).toEqual({ valid: true, errors: [] });
});

test("validateConfig rejects separate reset and billing intervals for usage-based items", () => {
	const plan = {
		id: "scale-annual",
		name: "Scale Annual",
		items: [
			item({
				featureId: "credits",
				included: 1_000,
				reset: { interval: "month" },
				price: {
					amount: 0.01,
					interval: "year",
					billingMethod: "usage_based",
				},
			}),
		],
	} as const satisfies Plan;

	const result = validateConfig(
		[{ id: "credits", name: "Credits", type: "metered", consumable: true }],
		[plan],
	);

	expect(result.errors.map((error) => error.message)).toContain(
		"reset.interval and price.interval can only differ for prepaid prices.",
	);
});
