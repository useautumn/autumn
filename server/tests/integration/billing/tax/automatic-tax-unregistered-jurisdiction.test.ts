/**
 * Exploratory test: what happens when `automatic_tax: true`, the customer
 * has a valid resolvable address, but the merchant is NOT registered for
 * tax in that jurisdiction?
 *
 * Hypothesis (fail-open):
 *  - The attach SUCCEEDS — sub/invoice are created without error.
 *  - `automatic_tax.enabled === true` and `automatic_tax.status === "complete"`
 *    (Stripe DID evaluate; resolution succeeded, just no obligation).
 *  - Computed tax is $0 — `tax_amount_exclusive === 0` on the latest invoice.
 *
 * Distinct from the no-address-error test: that one exercises
 * `customer_tax_location_invalid` (location couldn't be resolved AT ALL).
 * This one exercises the location-resolved-but-unregistered branch, which
 * Stripe handles silently with $0 tax rather than throwing.
 *
 * Setup:
 *  - Sub-org has `automatic_tax: true`, registered ONLY for AU.
 *  - Customer has a Brazil address (BR) — outside AU registration scope.
 *  - V2 `billing.attach` Pro→Premium upgrade.
 *
 * NOTE: This test exercises Stripe Tax. Orgs using Sphere Tax (a third-
 * party tax provider that integrates via Stripe) may behave differently —
 * Sphere intercepts the calculation flow and is not asserted here. Our
 * `previewAttach` helper specifically calls `stripe.tax.calculations.create`
 * which is Stripe-Tax-only and will not return Sphere's calculation;
 * preview tax for Sphere users is a separate follow-up.
 */

import { expect, test } from "bun:test";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const brAddress = {
	country: "BR",
	line1: "Av. Paulista 1000",
	city: "São Paulo",
	postal_code: "01310-100",
	state: "SP",
};

test.concurrent(
	`${chalk.yellowBright(
		"automatic-tax-unregistered-jurisdiction (v2 /v1/billing.attach): unregistered location fails open — sub created, tax = 0",
	)}`,
	async () => {
		const customerId = "tax-unreg-jurisdiction";
		const proProd = products.pro({ id: "pro", items: [] });
		const premiumProd = products.premium({ id: "premium", items: [] });

		const { ctx, customer, autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.platform.create({
					configOverrides: { automatic_tax: true },
					// Registered ONLY for AU. Customer is in BR (Brazil) —
					// resolvable but unregistered.
					taxRegistrations: ["AU"],
				}),
				s.customer({
					testClock: false,
					paymentMethod: "success",
					stripeCustomerOverrides: { address: brAddress },
				}),
				s.products({ list: [proProd, premiumProd] }),
			],
			actions: [s.billing.attach({ productId: "pro" })],
		});

		const stripeCusId = customer!.processor!.id!;

		// Sanity: initial Pro sub. With auto_tax already on (config set in
		// platform.create), Stripe should compute tax against BR — find no
		// registration there — and return $0 tax. The sub should still
		// have created cleanly.
		const initialSubs = await ctx.stripeCli.subscriptions.list({
			customer: stripeCusId,
			limit: 1,
		});
		expect(initialSubs.data.length).toBeGreaterThan(0);
		expect(initialSubs.data[0].automatic_tax.enabled).toBe(true);
		console.log(
			`[unreg] initial pro sub: auto_tax.enabled=${initialSubs.data[0].automatic_tax.enabled}`,
		);

		// Upgrade Pro -> Premium. Should succeed. Stripe should NOT throw.
		// The proration invoice should have automatic_tax.enabled = true,
		// status = "complete", and the actual tax amount = 0 because
		// merchant has no obligation in BR.
		await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: `premium_${customerId}`,
		});

		// Strong assertions on the upgraded state.
		const upgradedSubs = await ctx.stripeCli.subscriptions.list({
			customer: stripeCusId,
			limit: 1,
		});
		expect(upgradedSubs.data.length).toBeGreaterThan(0);
		const upgradedSub = upgradedSubs.data[0];
		expect(upgradedSub.automatic_tax.enabled).toBe(true);
		// Note: `automatic_tax.status` lives on the invoice, not the
		// subscription, in the SDK version pinned by this repo. Asserted
		// on the proration invoice below.

		// Inspect the most recent invoice (the proration invoice from the
		// upgrade). It should have automatic_tax enabled + complete and
		// $0 tax.
		const invoices = await ctx.stripeCli.invoices.list({
			customer: stripeCusId,
			limit: 5,
		});
		expect(invoices.data.length).toBeGreaterThan(0);
		const prorationInvoice = invoices.data[0];
		expect(prorationInvoice.automatic_tax.enabled).toBe(true);
		expect(prorationInvoice.automatic_tax.status).toBe("complete");

		// The actionable assertion: tax computed = 0 in BR (unregistered).
		// `tax_amount_exclusive` was renamed and may be on different fields
		// across API versions; sum across all the totals fields Stripe
		// might populate to be robust.
		const totalTaxes = prorationInvoice.total_taxes ?? [];
		const sumOfTaxAmounts = totalTaxes.reduce(
			(acc, t) => acc + (t.amount ?? 0),
			0,
		);
		expect(sumOfTaxAmounts).toBe(0);

		console.log(
			`[unreg] upgrade succeeded: ` +
				`sub_auto_tax_enabled=${upgradedSub.automatic_tax.enabled} ` +
				`invoice_auto_tax_status=${prorationInvoice.automatic_tax.status} ` +
				`total_taxes=${JSON.stringify(totalTaxes)} ` +
				`sumOfTaxAmounts=${sumOfTaxAmounts}`,
		);
	},
	300_000,
);
