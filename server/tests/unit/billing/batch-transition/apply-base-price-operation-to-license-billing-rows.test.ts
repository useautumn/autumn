import { describe, expect, test } from "bun:test";
import {
	BillingInterval,
	type LicenseBillingPriceRow,
	type Price,
	PriceType,
} from "@autumn/shared";
import { applyBasePriceOperationToLicenseBillingRows } from "@/internal/billing/v2/actions/batchTransition/compute/operations/basePriceOperations/applyBasePriceOperationToLicenseBillingRows";

const fixedPrice = ({ id, amount }: { id: string; amount: number }): Price => ({
	id,
	internal_product_id: "seat_product",
	entitlement_id: null,
	proration_config: null,
	config: {
		type: PriceType.Fixed,
		amount,
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

const addRowContext = {
	customerProductId: "parent_customer_product",
	source: {
		type: "customer_license_seat" as const,
		customerLicenseId: "customer_license",
	},
};

describe("applyBasePriceOperationToLicenseBillingRows", () => {
	const fromPrice = fixedPrice({ id: "price_from", amount: 10 });
	const customPrice = fixedPrice({ id: "price_custom", amount: 15 });
	const toPrice = fixedPrice({ id: "price_to", amount: 20 });

	test("replaces only rows selected by the definition-aware operation", () => {
		const rows = applyBasePriceOperationToLicenseBillingRows({
			licenseBillingPriceRows: [
				billingRow({ price: fromPrice, quantity: 3 }),
				billingRow({ price: customPrice, quantity: 2 }),
			],
			operation: {
				type: "replace",
				fromPriceIds: [fromPrice.id],
				fromPrice,
				toPrice,
			},
			targetQuantity: 5,
			addRowContext,
		});

		expect(rows.map(({ price, quantity }) => [price.id, quantity])).toEqual([
			[toPrice.id, 3],
			[customPrice.id, 2],
		]);
	});

	test("removes only rows selected by the definition-aware operation", () => {
		const rows = applyBasePriceOperationToLicenseBillingRows({
			licenseBillingPriceRows: [
				billingRow({ price: fromPrice, quantity: 3 }),
				billingRow({ price: customPrice, quantity: 2 }),
			],
			operation: {
				type: "remove",
				fromPriceIds: [fromPrice.id],
				fromPrice,
			},
			targetQuantity: 0,
			addRowContext,
		});

		expect(rows.map(({ price }) => price.id)).toEqual([customPrice.id]);
	});

	test("adds only the quantity without an existing base price", () => {
		const rows = applyBasePriceOperationToLicenseBillingRows({
			licenseBillingPriceRows: [
				billingRow({ price: customPrice, quantity: 2 }),
			],
			operation: {
				type: "add",
				existingBasePriceIds: [customPrice.id, toPrice.id],
				toPrice,
			},
			targetQuantity: 5,
			addRowContext,
		});

		expect(rows.map(({ price, quantity }) => [price.id, quantity])).toEqual([
			[customPrice.id, 2],
			[toPrice.id, 3],
		]);
	});
});
