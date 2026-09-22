import { describe, expect, test } from "bun:test";
import {
	BillingInterval,
	type LicenseBillingPriceRow,
	type Price,
	PriceType,
} from "@autumn/shared";
import { capLicenseBillingBasePriceRows } from "@/internal/billing/v2/compute/customerLicenseTransitions/capLicenseBillingBasePriceRows";

const fixedPrice = ({
	id,
	entitlementId = null,
}: {
	id: string;
	entitlementId?: string | null;
}): Price => ({
	id,
	internal_product_id: "seat_product",
	entitlement_id: entitlementId,
	proration_config: null,
	config: {
		type: PriceType.Fixed,
		amount: 10,
		interval: BillingInterval.Month,
		feature_id: null,
		internal_feature_id: null,
	},
});

const billingRow = ({
	price,
	quantity,
}: {
	price: Price;
	quantity: number;
}): LicenseBillingPriceRow => ({
	customerProductId: "parent_customer_product",
	price,
	quantity,
	source: {
		type: "customer_license_seat",
		customerLicenseId: "customer_license",
	},
});

describe("capLicenseBillingBasePriceRows", () => {
	test("caps recurring base prices without changing entitlement prices", () => {
		const basePriceA = fixedPrice({ id: "base_a" });
		const basePriceB = fixedPrice({ id: "base_b" });
		const entitlementPrice = fixedPrice({
			id: "entitlement",
			entitlementId: "entitlement_id",
		});

		const rows = capLicenseBillingBasePriceRows({
			licenseBillingPriceRows: [
				billingRow({ price: basePriceA, quantity: 2 }),
				billingRow({ price: entitlementPrice, quantity: 3 }),
				billingRow({ price: basePriceB, quantity: 2 }),
			],
			targetQuantity: 3,
		});

		expect(rows.map(({ price, quantity }) => [price.id, quantity])).toEqual([
			[basePriceA.id, 2],
			[entitlementPrice.id, 3],
			[basePriceB.id, 1],
		]);
	});

	test("removes recurring base prices when no assigned seats are billable", () => {
		const entitlementPrice = fixedPrice({
			id: "entitlement",
			entitlementId: "entitlement_id",
		});
		const rows = capLicenseBillingBasePriceRows({
			licenseBillingPriceRows: [
				billingRow({ price: fixedPrice({ id: "base" }), quantity: 1 }),
				billingRow({ price: entitlementPrice, quantity: 2 }),
			],
			targetQuantity: 0,
		});

		expect(rows.map(({ price, quantity }) => [price.id, quantity])).toEqual([
			[entitlementPrice.id, 2],
		]);
	});
});
