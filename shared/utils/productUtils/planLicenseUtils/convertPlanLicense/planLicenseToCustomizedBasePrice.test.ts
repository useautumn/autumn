import { describe, expect, test } from "bun:test";
import type { FullPlanLicense } from "@models/licenseModels/fullPlanLicenseModel.js";
import { BillingInterval } from "@models/productModels/intervals/billingInterval.js";
import { PriceType } from "@models/productModels/priceModels/priceEnums.js";
import { planLicenseToCustomizedBasePrice } from "./planLicenseToCustomizedBasePrice.js";

const planLicenseWithBasePrice = ({
	customized,
	isCustomPrice,
}: {
	customized: boolean;
	isCustomPrice: boolean;
}): FullPlanLicense =>
	({
		customized,
		product: {
			prices: [
				{
					id: "price_test",
					is_custom: isCustomPrice,
					config: {
						type: PriceType.Fixed,
						amount: 20,
						interval: BillingInterval.Month,
					},
				},
			],
		},
	}) as FullPlanLicense;

describe("planLicenseToCustomizedBasePrice", () => {
	test("returns the custom base price for a customized link", () => {
		const planLicense = planLicenseWithBasePrice({
			customized: true,
			isCustomPrice: true,
		});

		expect(planLicenseToCustomizedBasePrice({ planLicense })?.id).toBe(
			"price_test",
		);
	});

	test("requires the link itself to be customized", () => {
		const planLicense = planLicenseWithBasePrice({
			customized: false,
			isCustomPrice: true,
		});

		expect(planLicenseToCustomizedBasePrice({ planLicense })).toBeNull();
	});

	test("ignores a reused stock base price", () => {
		const planLicense = planLicenseWithBasePrice({
			customized: true,
			isCustomPrice: false,
		});

		expect(planLicenseToCustomizedBasePrice({ planLicense })).toBeNull();
	});
});
