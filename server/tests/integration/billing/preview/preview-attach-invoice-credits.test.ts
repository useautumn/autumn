/**
 * Integration test for the new `invoice_credits` field on `previewAttach`.
 *
 * Architecture (per fetch–build–execute):
 *   Symptom surfaces in: server/src/internal/billing/v2/utils/billingPlan/billingPlanToAttachPreview.ts
 *     (formatter passes through `billingPlan.preview.invoiceCredits` to the response)
 *   Root cause lives in: server/src/internal/billing/v2/utils/billingPlan/preview/invoiceCredits/computeAttachInvoiceCreditPreview.ts
 *     (build-stage helper that reads stripeCustomer.balance off the
 *     billingContext)
 *   Fix layer: same — preview enrichment is genuinely owned at this layer,
 *     mirroring the existing tax helper. No upstream invariant lives higher.
 *
 * Contract: `invoice_credits` is ALWAYS present in the response when a
 * Stripe customer is connected to this customer, regardless of balance
 * value or checkout mode. The frontend decides whether to display the row.
 *
 * Sign convention under test: Stripe stores a customer credit as a NEGATIVE
 * `balance`. The API surfaces it as a POSITIVE `balance` so the frontend
 * can simply subtract it from the post-tax total.
 *
 * Cases:
 *  - Stripe balance = -2000 ($20 credit), card-on-file flow → present, balance=20.
 *  - Stripe balance = 0 → present, balance=0.
 *  - Stripe balance = -2000, stripe_checkout flow → present, balance=20.
 *    (Field still returned; FE just hides the row when redirecting to Checkout.)
 */

import { expect, test } from "bun:test";
import type { AttachPreviewResponse } from "@autumn/shared";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("preview-attach-invoice-credits (Stripe credit on file): present, sign-flipped to positive, currency matches")}`,
	async () => {
		const customerId = "invoice-credits-on";
		const proProd = products.pro({ id: "pro", items: [] });

		const { autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({
					testClock: false,
					paymentMethod: "success",
					// Stripe stores credit as a negative balance. -2000 = $20 credit.
					stripeCustomerOverrides: { balance: -2000 },
				}),
				s.products({ list: [proProd] }),
			],
			actions: [],
		});

		const preview = (await autumnV2_2.billing.previewAttach({
			customer_id: customerId,
			plan_id: `pro_${customerId}`,
		})) as AttachPreviewResponse;

		expect(preview.invoice_credits).toBeDefined();
		// Sign-flipped: stripe -2000 → atmn +20 in major units.
		expect(preview.invoice_credits?.balance).toBe(20);
		expect(preview.invoice_credits?.currency).toBe(preview.currency);
		// Total contract: subtotal stays pre-credit; total subtracts credit
		// capped at subtotal+tax (no auto_tax here → tax=0). $20 plan,
		// $20 credit on file → total = 0.
		expect(preview.subtotal).toBe(20);
		expect(preview.total).toBe(0);
	},
	300_000,
);

test.concurrent(
	`${chalk.yellowBright("preview-attach-invoice-credits (zero balance): present, balance=0, currency matches")}`,
	async () => {
		const customerId = "invoice-credits-zero";
		const proProd = products.pro({ id: "pro", items: [] });

		const { autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({
					testClock: false,
					paymentMethod: "success",
					// No balance override — Stripe defaults to 0.
				}),
				s.products({ list: [proProd] }),
			],
			actions: [],
		});

		const preview = (await autumnV2_2.billing.previewAttach({
			customer_id: customerId,
			plan_id: `pro_${customerId}`,
		})) as AttachPreviewResponse;

		expect(preview.invoice_credits).toBeDefined();
		expect(preview.invoice_credits?.balance).toBe(0);
		expect(preview.invoice_credits?.currency).toBe(preview.currency);
		// No credit, no tax → total === subtotal.
		expect(preview.subtotal).toBe(20);
		expect(preview.total).toBe(20);
	},
	300_000,
);

test.concurrent(
	`${chalk.yellowBright("preview-attach-invoice-credits (stripe_checkout flow): still present, frontend chooses not to render the row")}`,
	async () => {
		const customerId = "invoice-credits-stripe-checkout";
		const proProd = products.pro({ id: "pro", items: [] });

		const { autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({
					testClock: false,
					// NO paymentMethod — forces stripe_checkout flow on attach.
					stripeCustomerOverrides: { balance: -2000 },
				}),
				s.products({ list: [proProd] }),
			],
			actions: [],
		});

		const preview = (await autumnV2_2.billing.previewAttach({
			customer_id: customerId,
			plan_id: `pro_${customerId}`,
		})) as AttachPreviewResponse;

		expect(preview.checkout_type).toBe("stripe_checkout");
		// Field is still returned — Stripe Checkout will apply the balance
		// itself, so the FE hides the row to avoid confusing display. But
		// the numeric `total` stays accurate per the API contract: $20
		// plan minus $20 credit = $0.
		expect(preview.invoice_credits).toBeDefined();
		expect(preview.invoice_credits?.balance).toBe(20);
		expect(preview.invoice_credits?.currency).toBe(preview.currency);
		expect(preview.subtotal).toBe(20);
		expect(preview.total).toBe(0);
	},
	300_000,
);
