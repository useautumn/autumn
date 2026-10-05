/** Seat lines outside a backdate gap bill their own current cycle, whatever the subscription's backdate. */

import { describe, expect, test } from "bun:test";
import {
	addInterval,
	BillingInterval,
	BillingVersion,
	type FullCustomerLicense,
	type FullPlanLicense,
	type LineItem,
	ms,
} from "@autumn/shared";
import { contexts } from "@tests/utils/fixtures/db/contexts";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts";
import { prices } from "@tests/utils/fixtures/db/prices";
import { products } from "@tests/utils/fixtures/db/products";
import { customerLicenseToLineItems } from "@/internal/billing/v2/utils/lineItems/customerLicenseToLineItems";

const ctx = contexts.create({});
const CYCLE_START = Date.UTC(2026, 8, 10);
const NOW = CYCLE_START + ms.days(12);
const CYCLE_END = addInterval({
	from: CYCLE_START,
	interval: BillingInterval.Month,
});
const SEAT_PRICE = 10;
const PAID_SEATS = 5;

const seatPrice = prices.buildFixed({
	overrides: { id: "price_seat" },
	configOverrides: { amount: SEAT_PRICE },
});
const seatProduct = products.createFull({ id: "seat", prices: [seatPrice] });

const seatPlanLicense: FullPlanLicense = {
	id: "plan_lic_seat",
	parent_internal_product_id: "prod_internal_pro",
	is_custom: false,
	license_internal_product_id: seatProduct.internal_id,
	included: 0,
	prepaid_only: false,
	customized: false,
	metadata: null,
	created_at: CYCLE_START,
	updated_at: CYCLE_START,
	product: seatProduct,
};

const customerLicense: FullCustomerLicense = {
	id: "cus_lic_seat",
	link_id: "cus_lic_seat",
	internal_customer_id: "cus_internal",
	parent_customer_product_id: "cus_prod_pro",
	license_internal_product_id: seatProduct.internal_id,
	plan_license_id: seatPlanLicense.id,
	granted: PAID_SEATS,
	remaining: PAID_SEATS,
	paid_quantity: PAID_SEATS,
	created_at: CYCLE_START,
	updated_at: CYCLE_START,
	planLicense: seatPlanLicense,
};

const pro = products.createFull({
	id: "pro",
	prices: [prices.createFixed({ id: "price_pro" })],
});
const customerProduct = {
	...customerProducts.create({
		id: "cus_prod_pro",
		productId: pro.id,
		product: pro,
		startsAt: CYCLE_START,
	}),
	customer_licenses: [customerLicense],
};

const seatChargeLines = ({
	subscriptionBackdateStartMs,
}: {
	subscriptionBackdateStartMs?: number;
} = {}) =>
	customerLicenseToLineItems({
		ctx,
		billingContext: {
			...contexts.createBilling({
				customerProducts: [customerProduct],
				fullProducts: [pro],
				currentEpochMs: NOW,
				billingCycleAnchorMs: CYCLE_START,
				resetCycleAnchorMs: CYCLE_START,
				billingVersion: BillingVersion.V2,
			}),
			subscriptionBackdateStartMs,
		},
		customerProduct,
		customerLicense,
		direction: "charge",
	}).map(({ id: _id, context, ...lineItem }: LineItem) => ({
		...lineItem,
		billingPeriod: context.billingPeriod,
		effectivePeriod: context.effectivePeriod,
		now: context.now,
		backdate: context.backdate,
	}));

const remainingCycleShare = (CYCLE_END - NOW) / (CYCLE_END - CYCLE_START);

describe("customerLicenseToLineItems without a backdate gap", () => {
	test("a charge bills the paid seats pro rata over the rest of the current cycle", () => {
		const [seatLine, ...rest] = seatChargeLines();

		expect(rest).toEqual([]);
		expect(seatLine).toMatchObject({
			paidQuantity: PAID_SEATS,
			totalQuantity: PAID_SEATS,
			chargeImmediately: true,
			prorated: true,
			billingPeriod: { start: CYCLE_START, end: CYCLE_END },
			effectivePeriod: { start: NOW, end: CYCLE_END },
			now: NOW,
			backdate: undefined,
		});
		expect(seatLine?.amount).toBeCloseTo(
			PAID_SEATS * SEAT_PRICE * remainingCycleShare,
			2,
		);
	});

	test("a new backdated subscription still bills seats only for the current cycle", () => {
		expect(
			seatChargeLines({
				subscriptionBackdateStartMs: CYCLE_START - ms.days(40),
			}),
		).toEqual(seatChargeLines());
	});
});
