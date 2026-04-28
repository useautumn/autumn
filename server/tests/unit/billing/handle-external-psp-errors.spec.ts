/**
 * Unit tests for handleExternalPSPErrors (V2 attach + update gate).
 *
 * Key invariants:
 *   - On `update`, fail when the targeted cusProduct is RC-managed.
 *   - On `attach`, scan ALL customer_products for non-Stripe processors.
 *   - On `attach`, bypass ONLY when attaching a true one-off (every price has
 *     interval === OneOff). Recurring add-ons take the strict path.
 */

import { describe, expect, test } from "bun:test";
import {
	BillingInterval,
	type FullCusProduct,
	type FullProduct,
	PriceType,
	ProcessorType,
	type RecaseError,
} from "@autumn/shared";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts";
import { prices as priceFixtures } from "@tests/utils/fixtures/db/prices";
import { products as productFixtures } from "@tests/utils/fixtures/db/products";
import chalk from "chalk";
import { handleExternalPSPErrors } from "@/internal/billing/v2/common/errors/handleExternalPSPErrors";

const expectThrows = (fn: () => unknown, messageMatch: string | RegExp) => {
	let caught: unknown;
	try {
		fn();
	} catch (err) {
		caught = err;
	}
	expect(caught).toBeDefined();
	const err = caught as RecaseError;
	if (typeof messageMatch === "string") {
		expect(err.message).toContain(messageMatch);
	} else {
		expect(err.message).toMatch(messageMatch);
	}
};

const buildOneOffProduct = (id: string, isAddOn = true): FullProduct =>
	productFixtures.createFull({
		id,
		name: id,
		isAddOn,
		prices: [priceFixtures.createOneOff({ id: `pr_${id}` })],
	});

const buildRecurringProduct = (id: string, isAddOn = false): FullProduct =>
	productFixtures.createFull({
		id,
		name: id,
		isAddOn,
		prices: [priceFixtures.createFixed({ id: `pr_${id}` })],
	});

const buildMixedIntervalProduct = (id: string): FullProduct =>
	productFixtures.createFull({
		id,
		name: id,
		isAddOn: true,
		prices: [
			priceFixtures.createOneOff({ id: `pr_${id}_oneoff` }),
			// A recurring price alongside a one-off → not "only one off"
			{
				id: `pr_${id}_monthly`,
				internal_product_id: "prod_internal",
				org_id: "org_test",
				created_at: Date.now(),
				billing_type: "fixed_cycle",
				is_custom: false,
				entitlement_id: null,
				proration_config: null,
				config: {
					type: PriceType.Fixed,
					amount: 50,
					interval: BillingInterval.Month,
					stripe_price_id: `stripe_price_${id}_monthly`,
				},
			} as FullProduct["prices"][number],
		],
	});

const buildRcCusProduct = (id = "cus_prod_rc"): FullCusProduct => {
	const product = buildRecurringProduct("rc_main", false);
	return customerProducts.create({
		id,
		productId: "rc_main",
		product,
		customerPrices: product.prices.map((price) =>
			priceFixtures.createCustomer({ price, customerProductId: id }),
		),
		processorType: ProcessorType.RevenueCat,
		subscriptionIds: [],
	});
};

/** RC-managed cus product whose underlying product has only one-off prices. */
const buildRcOneOffCusProduct = (id = "cus_prod_rc_oneoff"): FullCusProduct => {
	const product = buildOneOffProduct("rc_oneoff", true);
	return customerProducts.create({
		id,
		productId: "rc_oneoff",
		product,
		customerPrices: product.prices.map((price) =>
			priceFixtures.createCustomer({ price, customerProductId: id }),
		),
		processorType: ProcessorType.RevenueCat,
		subscriptionIds: [],
	});
};

const buildStripeCusProduct = (id = "cus_prod_stripe"): FullCusProduct =>
	customerProducts.create({
		id,
		productId: "stripe_main",
		processorType: ProcessorType.Stripe,
		subscriptionIds: ["sub_xyz"],
	});

describe(
	chalk.yellowBright("handleExternalPSPErrors v2 - update action"),
	() => {
		test("throws when updating an RC-managed cusProduct", () => {
			const cp = buildRcCusProduct();
			expectThrows(
				() =>
					handleExternalPSPErrors({
						customerProduct: cp,
						action: "update",
					}),
				"managed by RevenueCat",
			);
		});

		test("does not throw when updating a Stripe-managed cusProduct", () => {
			const cp = buildStripeCusProduct();
			expect(() =>
				handleExternalPSPErrors({
					customerProduct: cp,
					action: "update",
				}),
			).not.toThrow();
		});

		test("does not throw when no cusProduct is provided", () => {
			expect(() =>
				handleExternalPSPErrors({ action: "update" }),
			).not.toThrow();
		});
	},
);

describe(
	chalk.yellowBright("handleExternalPSPErrors v2 - attach action"),
	() => {
		test("BYPASS: attaching a one-off product when customer has RC main", () => {
			const rc = buildRcCusProduct();
			const oneOff = buildOneOffProduct("topup_25", true);

			expect(() =>
				handleExternalPSPErrors({
					customerProducts: [rc],
					attachProduct: oneOff,
					action: "attach",
				}),
			).not.toThrow();
		});

		test("THROWS: attaching a recurring add-on when customer has RC main", () => {
			const rc = buildRcCusProduct();
			const recurringAddOn = buildRecurringProduct("recurring_addon", true);

			expectThrows(
				() =>
					handleExternalPSPErrors({
						customerProducts: [rc],
						attachProduct: recurringAddOn,
						action: "attach",
					}),
				"managed by RevenueCat",
			);
		});

		test("THROWS: attaching a main recurring product when customer has RC main", () => {
			const rc = buildRcCusProduct();
			const mainRecurring = buildRecurringProduct("pro_50_monthly", false);

			expectThrows(
				() =>
					handleExternalPSPErrors({
						customerProducts: [rc],
						attachProduct: mainRecurring,
						action: "attach",
					}),
				"managed by RevenueCat",
			);
		});

		test("THROWS: attaching a product with mixed one-off + recurring prices when customer has RC main", () => {
			const rc = buildRcCusProduct();
			const mixed = buildMixedIntervalProduct("mixed");

			expectThrows(
				() =>
					handleExternalPSPErrors({
						customerProducts: [rc],
						attachProduct: mixed,
						action: "attach",
					}),
				"managed by RevenueCat",
			);
		});

		test("BYPASS: customer has only Stripe-managed products, attaching a recurring add-on", () => {
			const stripe = buildStripeCusProduct();
			const recurringAddOn = buildRecurringProduct("recurring_addon", true);

			expect(() =>
				handleExternalPSPErrors({
					customerProducts: [stripe],
					attachProduct: recurringAddOn,
					action: "attach",
				}),
			).not.toThrow();
		});

		test("BYPASS: empty customer_products list", () => {
			const oneOff = buildOneOffProduct("topup_25", true);

			expect(() =>
				handleExternalPSPErrors({
					customerProducts: [],
					attachProduct: oneOff,
					action: "attach",
				}),
			).not.toThrow();
		});

		test("Mixed customer products: throws on RC even if Stripe is also present, when attaching recurring", () => {
			const rc = buildRcCusProduct("cus_prod_rc");
			const stripe = buildStripeCusProduct("cus_prod_stripe");
			const recurringAddOn = buildRecurringProduct("recurring_addon", true);

			expectThrows(
				() =>
					handleExternalPSPErrors({
						customerProducts: [stripe, rc],
						attachProduct: recurringAddOn,
						action: "attach",
					}),
				"managed by RevenueCat",
			);
		});

		test("Mixed customer products: bypass on RC + Stripe customer when attaching one-off", () => {
			const rc = buildRcCusProduct("cus_prod_rc");
			const stripe = buildStripeCusProduct("cus_prod_stripe");
			const oneOff = buildOneOffProduct("topup_25", true);

			expect(() =>
				handleExternalPSPErrors({
					customerProducts: [stripe, rc],
					attachProduct: oneOff,
					action: "attach",
				}),
			).not.toThrow();
		});

		test("Defensive: throws when no attachProduct is provided but customer has RC", () => {
			const rc = buildRcCusProduct();

			expectThrows(
				() =>
					handleExternalPSPErrors({
						customerProducts: [rc],
						action: "attach",
					}),
				"managed by RevenueCat",
			);
		});

		// ─── External one-off-only products are NOT a conflict ──────────────────
		test("BYPASS: customer has only an RC ONE-OFF product, attaching a Stripe recurring", () => {
			// RC one-off (e.g. an in-app topup) doesn't have a recurring sub —
			// nothing to conflict with the new Stripe attach.
			const rcOneOff = buildRcOneOffCusProduct();
			const recurringMain = buildRecurringProduct("pro_25_monthly", false);

			expect(() =>
				handleExternalPSPErrors({
					customerProducts: [rcOneOff],
					attachProduct: recurringMain,
					action: "attach",
				}),
			).not.toThrow();
		});

		test("BYPASS: customer has only an RC ONE-OFF product, attaching a Stripe recurring add-on", () => {
			const rcOneOff = buildRcOneOffCusProduct();
			const recurringAddOn = buildRecurringProduct("recurring_addon", true);

			expect(() =>
				handleExternalPSPErrors({
					customerProducts: [rcOneOff],
					attachProduct: recurringAddOn,
					action: "attach",
				}),
			).not.toThrow();
		});

		test("THROWS: customer has BOTH RC recurring and RC one-off, attaching a Stripe recurring", () => {
			// The one-off is benign but the recurring product still conflicts.
			const rcRecurring = buildRcCusProduct("cus_prod_rc_recurring");
			const rcOneOff = buildRcOneOffCusProduct("cus_prod_rc_oneoff");
			const recurringMain = buildRecurringProduct("pro_50_monthly", false);

			expectThrows(
				() =>
					handleExternalPSPErrors({
						customerProducts: [rcOneOff, rcRecurring],
						attachProduct: recurringMain,
						action: "attach",
					}),
				"managed by RevenueCat",
			);
		});

		test("BYPASS: customer has only an RC ONE-OFF, no attachProduct provided", () => {
			// Defensive: even without attachProduct, an RC one-off shouldn't
			// trigger the guard since there's no recurring conflict.
			const rcOneOff = buildRcOneOffCusProduct();

			expect(() =>
				handleExternalPSPErrors({
					customerProducts: [rcOneOff],
					action: "attach",
				}),
			).not.toThrow();
		});
	},
);
