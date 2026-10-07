import { describe, expect, test } from "bun:test";
import { CreatePlanItemParamsV1Schema } from "./createPlanItemParamsV1.js";

const pricedItem = (price: Record<string, unknown>) => ({
	feature_id: "messages",
	price: {
		interval: "month",
		billing_method: "prepaid",
		...price,
	},
});

const accepts = (price: Record<string, unknown>) =>
	CreatePlanItemParamsV1Schema.safeParse(pricedItem(price)).success;

describe("CreatePlanItemParamsV1 billing_units and tier shape", () => {
	test("rejects billing_units of 0 or below", () => {
		expect(accepts({ amount: 1, billing_units: 0 })).toBe(false);
		expect(accepts({ amount: 1, billing_units: -10 })).toBe(false);
		expect(accepts({ amount: 1, billing_units: 100 })).toBe(true);
	});

	test("requires tiers to end with inf", () => {
		expect(accepts({ tiers: [{ to: 100, amount: 1 }] })).toBe(false);
		expect(
			accepts({
				tiers: [
					{ to: 100, amount: 1 },
					{ to: "inf", amount: 0.5 },
				],
			}),
		).toBe(true);
	});

	test("accepts the legacy -1 as the final tier", () => {
		expect(
			accepts({
				tiers: [
					{ to: 100, amount: 1 },
					{ to: -1, amount: 0.5 },
				],
			}),
		).toBe(true);
	});

	test("requires strictly increasing tier bounds", () => {
		expect(
			accepts({
				tiers: [
					{ to: 100, amount: 1 },
					{ to: 50, amount: 2 },
					{ to: "inf", amount: 3 },
				],
			}),
		).toBe(false);
		expect(
			accepts({
				tiers: [
					{ to: 100, amount: 1 },
					{ to: 100, amount: 2 },
					{ to: "inf", amount: 3 },
				],
			}),
		).toBe(false);
		expect(
			accepts({
				tiers: [
					{ to: "inf", amount: 1 },
					{ to: "inf", amount: 2 },
				],
			}),
		).toBe(false);
	});
});
