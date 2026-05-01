/**
 * TDD: preview.tax inflated when proration credit lines are present.
 *
 * Bug: computeAttachTaxPreview filters lineItems with `net > 0`, dropping
 * "Unused" credit lines before passing to stripe.tax.calculations.create.
 * Tax gets computed on the positive sum, not the net invoice subtotal.
 *
 * User report: previewing Starter -> messy switch shows VAT $10.00
 * (20% x $50) but Stripe actually charges $8.60 (20% x $43 net subtotal).
 * Off by $1.40.
 *
 * Red-failure mode (current behavior):
 *  - Case 1 (upgrade with credit): preview.tax.total ~ positiveSum * rate
 *    (inflated, ignores negative proration credit)
 *  - Case 2 (downgrade, net <= 0): preview.tax.total > 0
 *    (Stripe still gets called with the positive line and taxes it)
 *  - Case 3 (all-positive new attach): correct
 *
 * Green-success criteria (after fix):
 *  - Case 1: preview.tax.total ~ netSubtotal * rate
 *  - Case 2: preview.tax.total === 0, status === "complete"
 *  - Case 3: unchanged (no regression)
 *
 * Architecture (per fetch-build-execute):
 *   Symptom surfaces in: billingPlanToAttachPreview.ts (formatter passes
 *     billingPlan.preview.tax through to the response)
 *   Root cause lives in: preview/tax/computeAttachTaxPreview.ts:55-58
 *     (filters net > 0, drops negative proration credits before Stripe Tax)
 *   Fix layer: same — computeAttachTaxPreview owns the "what subtotal gets
 *     taxed" invariant for previews. No upstream layer pre-computes a
 *     netSubtotal field.
 */

import { expect, test } from "bun:test";
import type { AttachPreviewResponse } from "@autumn/shared";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const auAddress = {
	country: "AU",
	line1: "1 Test St",
	city: "Sydney",
	postal_code: "2000",
	state: "NSW",
};

// AU GST rate, mirrors automatic-tax-proration.test.ts which uses
// `prorationInvoice.subtotal * 1.1` for the same jurisdiction.
const AU_GST_RATE = 0.1;

test.concurrent(`${chalk.yellowBright(
	"automatic-tax-preview-attach-prorated-credit (upgrade with proration credit): preview taxes net subtotal, not positive lines alone",
)}`, async () => {
	const customerId = "tax-preview-prorated-credit-upgrade";
	const proProd = products.pro({ id: "pro", items: [] });
	const premiumProd = products.premium({ id: "premium", items: [] });

	const { autumnV2_2 } = await initScenario({
		customerId,
		setup: [
			s.platform.create({
				configOverrides: { automatic_tax: true },
				taxRegistrations: ["AU"],
			}),
			s.customer({
				testClock: true,
				paymentMethod: "success",
				stripeCustomerOverrides: { address: auAddress },
			}),
			s.products({ list: [proProd, premiumProd] }),
		],
		actions: [
			s.billing.attach({ productId: "pro" }),
			s.advanceTestClock({ days: 15 }),
		],
	});

	// Pro $20/mo attached, advanced ~15 days into a 30-day cycle.
	// Preview switching to Premium $50/mo immediately:
	//   Premium prorated charge:   ~ +$25 (15 days remaining x $50 / 30)
	//   Unused Pro credit:         ~ -$10 (15 days remaining x $20 / 30)
	//   netSubtotal:               ~  $15
	// Bug: tax = positiveSum * rate    = 25 * 0.10 = $2.50
	// Fix: tax = netSubtotal * rate   = 15 * 0.10 = $1.50
	const preview = (await autumnV2_2.billing.previewAttach({
		customer_id: customerId,
		plan_id: `premium_${customerId}`,
	})) as AttachPreviewResponse;

	expect(preview.tax).toBeDefined();
	expect(preview.tax?.status).toBe("complete");

	// Compute expected tax from the preview's actual line items so we're
	// robust to small proration timing wobble (Stripe rounds based on
	// exact second of test-clock advance).
	const immediateLineItemsTotal = preview.line_items.reduce(
		(sum, li) => sum + li.total,
		0,
	);
	const expectedTax = immediateLineItemsTotal * AU_GST_RATE;

	console.log(
		`[preview-tax-prorated-credit upgrade] line_items_total=${immediateLineItemsTotal} expectedTax=${expectedTax} actualTax=${preview.tax?.total}`,
	);

	// Sanity: there ARE both positive and negative proration lines.
	const positiveLines = preview.line_items.filter((li) => li.total > 0);
	const negativeLines = preview.line_items.filter((li) => li.total < 0);
	expect(positiveLines.length).toBeGreaterThan(0);
	expect(negativeLines.length).toBeGreaterThan(0);

	// Sanity: the positive sum is meaningfully larger than the net subtotal,
	// so the bug's overstatement is observable.
	const positiveSum = positiveLines.reduce((sum, li) => sum + li.total, 0);
	expect(positiveSum).toBeGreaterThan(immediateLineItemsTotal + 5);

	// Core assertion: tax matches net subtotal x rate (within ±$0.05 to
	// absorb proration rounding). The buggy value is positiveSum * rate
	// which is comfortably outside this band.
	expect(preview.tax?.total).toBeGreaterThanOrEqual(expectedTax - 0.05);
	expect(preview.tax?.total).toBeLessThanOrEqual(expectedTax + 0.05);
}, 300_000);

test.concurrent(`${chalk.yellowBright(
	"automatic-tax-preview-attach-prorated-credit (downgrade, credit exceeds new charge): preview tax is zero with status complete",
)}`, async () => {
	const customerId = "tax-preview-prorated-credit-downgrade";
	const proProd = products.pro({ id: "pro", items: [] });
	const premiumProd = products.premium({ id: "premium", items: [] });

	const { autumnV2_2 } = await initScenario({
		customerId,
		setup: [
			s.platform.create({
				configOverrides: { automatic_tax: true },
				taxRegistrations: ["AU"],
			}),
			s.customer({
				testClock: true,
				paymentMethod: "success",
				stripeCustomerOverrides: { address: auAddress },
			}),
			s.products({ list: [proProd, premiumProd] }),
		],
		actions: [
			s.billing.attach({ productId: "premium" }),
			s.advanceTestClock({ days: 5 }),
		],
	});

	// Premium $50/mo attached, advanced ~5 days into a 30-day cycle.
	// Preview immediate downgrade to Pro $20/mo:
	//   Pro prorated charge:        ~ +$16.67 (25 days x $20 / 30)
	//   Unused Premium credit:      ~ -$41.67 (25 days x $50 / 30)
	//   netSubtotal:                ~ -$25.00  (credit exceeds charge)
	// Bug: tax = positiveSum * rate ~ 16.67 * 0.10 = ~$1.67
	// Fix: tax = 0 (skip Stripe call, no tax owed on net-credit invoice)
	const preview = (await autumnV2_2.billing.previewAttach({
		customer_id: customerId,
		plan_id: `pro_${customerId}`,
		plan_schedule: "immediate",
	})) as AttachPreviewResponse;

	expect(preview.tax).toBeDefined();
	expect(preview.tax?.status).toBe("complete");

	// Sanity: net subtotal of immediate line items is <= 0.
	const immediateLineItemsTotal = preview.line_items.reduce(
		(sum, li) => sum + li.total,
		0,
	);
	console.log(
		`[preview-tax-prorated-credit downgrade] line_items_total=${immediateLineItemsTotal} actualTax=${preview.tax?.total}`,
	);
	expect(immediateLineItemsTotal).toBeLessThanOrEqual(0);

	// Sanity: there's still a positive line that the buggy code would tax.
	const positiveLines = preview.line_items.filter((li) => li.total > 0);
	expect(positiveLines.length).toBeGreaterThan(0);

	// Core assertion: no tax when net subtotal is non-positive.
	expect(preview.tax?.total).toBe(0);
	expect(preview.tax?.amount_exclusive).toBe(0);
	expect(preview.tax?.amount_inclusive).toBe(0);
}, 300_000);

test.concurrent(`${chalk.yellowBright(
	"automatic-tax-preview-attach-prorated-credit (all-positive new attach): regression guard, no proration so tax is unchanged",
)}`, async () => {
	const customerId = "tax-preview-prorated-credit-no-credit";
	const proProd = products.pro({ id: "pro", items: [] });

	const { autumnV2_2 } = await initScenario({
		customerId,
		setup: [
			s.platform.create({
				configOverrides: { automatic_tax: true },
				taxRegistrations: ["AU"],
			}),
			s.customer({
				testClock: false,
				paymentMethod: "success",
				stripeCustomerOverrides: { address: auAddress },
			}),
			s.products({ list: [proProd] }),
		],
		// No prior attach — preview is for a fresh customer with no
		// existing subscription, so there are no proration credits.
		actions: [],
	});

	const preview = (await autumnV2_2.billing.previewAttach({
		customer_id: customerId,
		plan_id: `pro_${customerId}`,
	})) as AttachPreviewResponse;

	expect(preview.tax).toBeDefined();
	expect(preview.tax?.status).toBe("complete");

	// Only positive line items, no negatives.
	const negativeLines = preview.line_items.filter((li) => li.total < 0);
	expect(negativeLines.length).toBe(0);

	// Tax = sum of all line items * rate (which equals positive sum here
	// since no negatives). Same expectation before and after fix.
	const immediateLineItemsTotal = preview.line_items.reduce(
		(sum, li) => sum + li.total,
		0,
	);
	const expectedTax = immediateLineItemsTotal * AU_GST_RATE;

	console.log(
		`[preview-tax-prorated-credit no-credit] line_items_total=${immediateLineItemsTotal} expectedTax=${expectedTax} actualTax=${preview.tax?.total}`,
	);

	expect(preview.tax?.total).toBeGreaterThanOrEqual(expectedTax - 0.05);
	expect(preview.tax?.total).toBeLessThanOrEqual(expectedTax + 0.05);
}, 300_000);
