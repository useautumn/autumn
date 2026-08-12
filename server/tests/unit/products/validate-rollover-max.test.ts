import { describe, expect, test } from "bun:test";
import {
	AppEnv,
	type ProductItem,
	ProductItemInterval,
	type RolloverConfig,
	RolloverExpiryDurationType,
} from "@autumn/shared";
import { validateProductItems } from "@/internal/products/product-items/validateProductItems";

const run = (rollover: RolloverConfig) =>
	validateProductItems({
		newItems: [
			{
				feature_id: "messages",
				feature_type: "single_use",
				included_usage: 100,
				interval: ProductItemInterval.Month,
				config: { rollover },
			} as unknown as ProductItem,
		],
		features: [],
		orgId: "org_1",
		env: AppEnv.Sandbox,
		multiCurrencyEnabled: false,
	});

const baseRollover: RolloverConfig = {
	max: null,
	max_percentage: null,
	duration: RolloverExpiryDurationType.Month,
	length: 1,
};

describe("validateProductItems rollover max", () => {
	test("rejects rollover max of 0", () => {
		expect(() => run({ ...baseRollover, max: 0 })).toThrow(/greater than 0/i);
	});

	test("rejects negative rollover max", () => {
		expect(() => run({ ...baseRollover, max: -5 })).toThrow(/greater than 0/i);
	});

	test("accepts a positive rollover max", () => {
		expect(() => run({ ...baseRollover, max: 100 })).not.toThrow();
	});

	test("accepts null rollover max", () => {
		expect(() => run({ ...baseRollover })).not.toThrow();
	});

	test("accepts max_percentage without max", () => {
		expect(() => run({ ...baseRollover, max_percentage: 50 })).not.toThrow();
	});

	test("rejects max_percentage of 0", () => {
		expect(() => run({ ...baseRollover, max_percentage: 0 })).toThrow(
			/between 0/i,
		);
	});
});
