import { describe, expect, test } from "bun:test";
import {
	BillingInterval,
	ErrCode,
	type FixedPriceConfig,
	type FullPlanLicense,
	type FullProduct,
} from "@autumn/shared";
import { prices } from "@tests/utils/fixtures/db/prices";
import { products } from "@tests/utils/fixtures/db/products";
import { licenseQuantityToAmount } from "@/internal/invoices/actions/create/compute/licenseQuantityToAmount";

const seatPrice = prices.createFixed({ id: "seat_price" }); // $100 / month
const seatPlan = products.createFull({ id: "seat", prices: [seatPrice] });

const link = ({
	licensePlan,
	included = 0,
}: {
	licensePlan: FullProduct;
	included?: number;
}): FullPlanLicense =>
	({
		id: `pl_${licensePlan.id}`,
		parent_internal_product_id: "internal_pro",
		is_custom: false,
		license_internal_product_id: licensePlan.internal_id,
		included,
		prepaid_only: false,
		customized: false,
		metadata: null,
		created_at: Date.now(),
		updated_at: Date.now(),
		product: licensePlan,
	}) as FullPlanLicense;

const parent = {
	...products.createFull({
		id: "pro",
		prices: [prices.createFixed({ id: "base" })],
	}),
	licenses: [link({ licensePlan: seatPlan, included: 2 })],
} as FullProduct;

describe("licenseQuantityToAmount", () => {
	test("billable seats multiply the license price", () => {
		const resolved = licenseQuantityToAmount({
			parent,
			licensePlanId: "seat",
			quantity: 3,
		});
		expect(resolved.amount).toBe(300);
		expect(resolved.price.id).toBe("seat_price");
	});

	test("included seats on the link are not subtracted from billable seats", () => {
		expect(
			licenseQuantityToAmount({ parent, licensePlanId: "seat", quantity: 2 })
				.amount,
		).toBe(200);
	});

	test("zero seats charge nothing", () => {
		expect(
			licenseQuantityToAmount({ parent, licensePlanId: "seat", quantity: 0 })
				.amount,
		).toBe(0);
	});

	test("a license not linked to the parent is rejected", () => {
		expect(() =>
			licenseQuantityToAmount({ parent, licensePlanId: "viewer", quantity: 1 }),
		).toThrow(expect.objectContaining({ code: ErrCode.InvalidRequest }));
	});

	test("customize.price overrides the per-seat price for this invoice", () => {
		const resolved = licenseQuantityToAmount({
			parent,
			licensePlanId: "seat",
			quantity: 3,
			customize: { price: { amount: 15, interval: BillingInterval.Month } },
		});
		expect(resolved.amount).toBe(45);
		expect((seatPrice.config as FixedPriceConfig).amount).toBe(100);
	});

	test("customize.price null drops the seat charge", () => {
		expect(
			licenseQuantityToAmount({
				parent,
				licensePlanId: "seat",
				quantity: 3,
				customize: { price: null },
			}).amount,
		).toBe(0);
	});
});
