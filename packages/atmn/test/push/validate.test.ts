import { expect, test } from "bun:test";
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

test("validateConfig rejects billing controls that reference unexported features", () => {
	const result = validateConfig(
		[{ id: "messages", name: "Messages", type: "metered", consumable: true }],
		[
			{
				id: "pro",
				name: "Pro",
				billingControls: {
					spendLimits: [{ featureId: "analytics", enabled: true, overageLimit: 25 }],
				},
				variants: [
					{
						id: "pro_annual",
						name: "Pro Annual",
						customize: {
							billingControls: {
								autoTopups: [
									{
										featureId: "seats",
										enabled: true,
										threshold: 10,
										quantity: 100,
									},
								],
							},
						},
					},
				],
			},
		],
	);

	expect(result.valid).toBe(false);
	expect(result.errors.map((error) => error.message)).toEqual(
		expect.arrayContaining([
			`Feature "analytics" is referenced here but is not exported from your config.`,
			`Feature "seats" is referenced here but is not exported from your config.`,
		]),
	);
});

test("validateConfig rejects duplicate spend limits per feature", () => {
	const result = validateConfig(
		[{ id: "messages", name: "Messages", type: "metered", consumable: true }],
		[
			{
				id: "pro",
				name: "Pro",
				billingControls: {
					spendLimits: [
						{ featureId: "messages", enabled: true, overageLimit: 25 },
						{ featureId: "messages", enabled: true, overageLimit: 50 },
					],
				},
			},
		],
	);

	expect(result.valid).toBe(false);
	expect(result.errors[0]?.message).toBe(
		`Only one spend limit entry is allowed per featureId.`,
	);
});
