import { describe, expect, test } from "bun:test";
import type { BillingContext, DbInvoiceLineItem } from "@autumn/shared";
import { contexts } from "@tests/utils/fixtures/db/contexts";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts";
import { prices } from "@tests/utils/fixtures/db/prices";
import chalk from "chalk";
import { invoiceCreditFromStoredLineItems } from "@/internal/billing/v2/utils/lineItems/invoiceCreditFromStoredLineItems";
import {
	computeAlreadyRefundedForCharge,
	computeProratedCredit,
	splitMultiEntityAmount,
} from "@/internal/billing/v2/utils/lineItems/storedLineItemUtils";

const PERIOD_START = 1_700_000_000_000;
const PERIOD_END = PERIOD_START + 30 * 24 * 60 * 60 * 1000;
const MID_CYCLE = PERIOD_START + 15 * 24 * 60 * 60 * 1000;

const makeChargeRow = (
	overrides: Partial<DbInvoiceLineItem> = {},
): DbInvoiceLineItem =>
	({
		id: "li_charge_1",
		amount: 20,
		amount_after_discounts: 20,
		effective_period_start: PERIOD_START,
		effective_period_end: PERIOD_END,
		customer_product_ids: ["cp_1"],
		price_id: "price_pro",
		stripe_price_id: "stripe_price_pro",
		direction: "charge",
		discounts: [],
		...overrides,
	}) as DbInvoiceLineItem;

const makeRefundRow = (
	overrides: Partial<DbInvoiceLineItem> = {},
): DbInvoiceLineItem =>
	({
		id: "li_refund_1",
		amount: -10,
		amount_after_discounts: -10,
		effective_period_start: PERIOD_START,
		effective_period_end: PERIOD_END,
		customer_product_ids: ["cp_1"],
		price_id: "price_pro",
		stripe_price_id: "stripe_price_pro",
		direction: "refund",
		discounts: [],
		...overrides,
	}) as DbInvoiceLineItem;

describe(chalk.yellowBright("computeProratedCredit"), () => {
	test("prorates a full charge at mid-cycle to ~half negative", () => {
		const result = computeProratedCredit({
			chargeRow: makeChargeRow(),
			now: MID_CYCLE,
			alreadyRefunded: 0,
		});

		expect(result).toBeLessThan(0);
		expect(result).toBeCloseTo(-10, 0);
	});

	test("returns 0 when period has ended", () => {
		const result = computeProratedCredit({
			chargeRow: makeChargeRow(),
			now: PERIOD_END + 1000,
			alreadyRefunded: 0,
		});

		expect(result).toBe(0);
	});

	test("returns 0 when period is null", () => {
		const result = computeProratedCredit({
			chargeRow: makeChargeRow({ effective_period_start: null }),
			now: MID_CYCLE,
			alreadyRefunded: 0,
		});

		expect(result).toBe(0);
	});

	test("subtracts already-refunded before prorating", () => {
		const fullCredit = computeProratedCredit({
			chargeRow: makeChargeRow({ amount_after_discounts: 20 }),
			now: MID_CYCLE,
			alreadyRefunded: 0,
		});

		const partialCredit = computeProratedCredit({
			chargeRow: makeChargeRow({ amount_after_discounts: 20 }),
			now: MID_CYCLE,
			alreadyRefunded: 10,
		});

		expect(Math.abs(partialCredit)).toBeLessThan(Math.abs(fullCredit));
	});

	test("returns 0 when fully refunded", () => {
		const result = computeProratedCredit({
			chargeRow: makeChargeRow({ amount_after_discounts: 20 }),
			now: MID_CYCLE,
			alreadyRefunded: 20,
		});

		expect(result).toBe(0);
	});

	test("uses amount_after_discounts (discounted charge gives smaller credit)", () => {
		const fullPriceCredit = computeProratedCredit({
			chargeRow: makeChargeRow({ amount_after_discounts: 20 }),
			now: MID_CYCLE,
			alreadyRefunded: 0,
		});

		const discountedCredit = computeProratedCredit({
			chargeRow: makeChargeRow({ amount_after_discounts: 16 }),
			now: MID_CYCLE,
			alreadyRefunded: 0,
		});

		expect(Math.abs(discountedCredit)).toBeLessThan(Math.abs(fullPriceCredit));
	});
});

describe(chalk.yellowBright("computeAlreadyRefundedForCharge"), () => {
	test("sums matching refund rows by price and period", () => {
		const result = computeAlreadyRefundedForCharge({
			chargeRow: makeChargeRow(),
			refundRows: [
				makeRefundRow({ amount_after_discounts: -5 }),
				makeRefundRow({ id: "li_refund_2", amount_after_discounts: -3 }),
			],
		});

		expect(result).toBe(8);
	});

	test("excludes refunds with different price_id", () => {
		const result = computeAlreadyRefundedForCharge({
			chargeRow: makeChargeRow(),
			refundRows: [
				makeRefundRow({ price_id: "price_other", stripe_price_id: "other" }),
			],
		});

		expect(result).toBe(0);
	});

	test("excludes refunds outside the charge period", () => {
		const result = computeAlreadyRefundedForCharge({
			chargeRow: makeChargeRow(),
			refundRows: [
				makeRefundRow({
					effective_period_start: PERIOD_END + 1000,
					effective_period_end: PERIOD_END + 30 * 24 * 60 * 60 * 1000,
				}),
			],
		});

		expect(result).toBe(0);
	});

	test("returns 0 with no refund rows", () => {
		const result = computeAlreadyRefundedForCharge({
			chargeRow: makeChargeRow(),
			refundRows: [],
		});

		expect(result).toBe(0);
	});
});

describe(chalk.yellowBright("splitMultiEntityAmount"), () => {
	test("returns full amount for single cusProduct", () => {
		const result = splitMultiEntityAmount(
			makeChargeRow({ amount_after_discounts: 30 }),
		);

		expect(result).toBe(30);
	});

	test("splits evenly across multiple cusProduct ids", () => {
		const result = splitMultiEntityAmount(
			makeChargeRow({
				amount_after_discounts: 30,
				customer_product_ids: ["cp_1", "cp_2", "cp_3"],
			}),
		);

		expect(result).toBe(10);
	});

	test("handles empty customer_product_ids", () => {
		const result = splitMultiEntityAmount(
			makeChargeRow({
				amount_after_discounts: 30,
				customer_product_ids: [],
			}),
		);

		expect(result).toBe(30);
	});
});

describe(chalk.yellowBright("invoiceCreditFromStoredLineItems"), () => {
	const buildMultiPriceContext = ({
		storedChargeLineItems,
	}: {
		storedChargeLineItems: DbInvoiceLineItem[];
	}) => {
		const proPrice = prices.createFixed({ id: "price_pro" });
		const addonPrice = prices.createFixed({ id: "price_addon" });
		const customerProduct = customerProducts.create({
			id: "cp_1",
			customerPrices: [
				prices.createCustomer({ price: proPrice, customerProductId: "cp_1" }),
				prices.createCustomer({ price: addonPrice, customerProductId: "cp_1" }),
			],
		});
		const billingContext: BillingContext = {
			...contexts.createBilling({
				customerProducts: [customerProduct],
				currentEpochMs: MID_CYCLE,
			}),
			storedChargeLineItems,
			storedRefundLineItems: [],
		};
		return { ctx: contexts.create({}), customerProduct, billingContext };
	};

	test("does not duplicate credits when only some prices have stored rows", () => {
		const { ctx, customerProduct, billingContext } = buildMultiPriceContext({
			storedChargeLineItems: [makeChargeRow({ price_id: "price_pro" })],
		});

		const result = invoiceCreditFromStoredLineItems({
			ctx,
			customerProduct,
			billingContext,
		});

		expect(result.allPricesResolved).toBe(false);
		expect(result.resolvedPriceIds).toEqual(["price_pro"]);
		expect(result.lineItems).toHaveLength(1);
		expect(result.lineItems[0].amount).toBeLessThan(0);
	});

	test("resolves all prices when every price has a stored row", () => {
		const { ctx, customerProduct, billingContext } = buildMultiPriceContext({
			storedChargeLineItems: [
				makeChargeRow({ id: "li_charge_pro", price_id: "price_pro" }),
				makeChargeRow({ id: "li_charge_addon", price_id: "price_addon" }),
			],
		});

		const result = invoiceCreditFromStoredLineItems({
			ctx,
			customerProduct,
			billingContext,
		});

		expect(result.allPricesResolved).toBe(true);
		expect(result.resolvedPriceIds).toEqual(["price_pro", "price_addon"]);
		expect(result.lineItems).toHaveLength(2);
	});
});
