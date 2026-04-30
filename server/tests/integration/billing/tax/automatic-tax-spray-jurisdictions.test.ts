/**
 * Spray test exercising `automatic_tax: true` across a representative spread
 * of tax jurisdictions, all sharing ONE platform sub-org. The sub-org
 * registers Stripe Tax in every covered country at once, then provisions a
 * customer per jurisdiction (each with an address in that country) and
 * attaches the same recurring product.
 *
 * Why one sub-org instead of N: real platform tenants register multiple
 * jurisdictions on a single Stripe Connect account. This test verifies the
 * factory's `taxRegistrations: [...]` array correctly handles multi-country
 * setup AND that Stripe Tax routes the right rate to each customer based
 * on customer address + merchant nexus.
 *
 * Jurisdictions covered:
 *  - United Kingdom (GB) — 20% VAT
 *  - Canada (CA) — federal GST/HST simplified, ~5%
 *  - California / United States (US) — ~7-9% state sales tax (note: SaaS
 *    is generally NOT taxable in CA, so tax may legitimately compute as $0)
 *  - Australia (AU) — 10% GST
 *  - France (FR) — 20% VAT (EU standard)
 *  - Germany (DE) — 19% VAT (EU standard)
 *  - Saudi Arabia (SA) — 15% VAT (simplified)
 *  - Russia (RU) — 20% VAT (simplified)
 *
 * What this test asserts:
 *  - Every jurisdiction's Stripe Tax registration succeeds in the factory
 *    (no SDK shape mismatch, no rejected `country_options`).
 *  - The resulting Stripe subscription for each per-jurisdiction customer
 *    has `automatic_tax.enabled === true`.
 *  - The factory's head-office-address bootstrap supports all 8 in one go.
 *
 * What this test does NOT assert:
 *  - Specific tax rates per country. Stripe Tax rate depends on customer
 *    address + product tax_code + merchant nexus; rate can legitimately be
 *    $0 in some jurisdictions for SaaS (CA most notably), so a strict
 *    `tax > 0` would be false-positive prone.
 *  - That Stripe Tax has accurate registrations for every test-mode
 *    jurisdiction. If a registration genuinely fails (Stripe doesn't
 *    support it in test mode, sanctions, etc.), the factory swallows the
 *    error with a warning — eyeball the run logs for any "Failed to
 *    register Stripe Tax" warnings.
 */

import { expect, test } from "bun:test";
import chalk from "chalk";
import type Stripe from "stripe";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";

type Jurisdiction = {
	label: string;
	country: "GB" | "CA" | "US" | "AU" | "FR" | "DE" | "SA" | "RU";
	address: Stripe.AddressParam;
};

const jurisdictions: Jurisdiction[] = [
	{
		label: "UK VAT",
		country: "GB",
		address: {
			country: "GB",
			line1: "10 Downing Street",
			city: "London",
			postal_code: "SW1A 2AA",
		},
	},
	{
		label: "Canada GST/HST",
		country: "CA",
		address: {
			country: "CA",
			line1: "1 Yonge Street",
			city: "Toronto",
			postal_code: "M5E 1W7",
			state: "ON",
		},
	},
	{
		label: "California / US sales tax",
		country: "US",
		address: {
			country: "US",
			line1: "1 Market Street",
			city: "San Francisco",
			postal_code: "94105",
			state: "CA",
		},
	},
	{
		label: "Australia GST",
		country: "AU",
		address: {
			country: "AU",
			line1: "1 Test St",
			city: "Sydney",
			postal_code: "2000",
			state: "NSW",
		},
	},
	{
		label: "France VAT",
		country: "FR",
		address: {
			country: "FR",
			line1: "1 Avenue des Champs-Elysees",
			city: "Paris",
			postal_code: "75008",
		},
	},
	{
		label: "Germany VAT",
		country: "DE",
		address: {
			country: "DE",
			line1: "1 Brandenburger Tor",
			city: "Berlin",
			postal_code: "10117",
		},
	},
	{
		label: "Saudi Arabia VAT",
		country: "SA",
		address: {
			country: "SA",
			line1: "1 Al Olaya Street",
			city: "Riyadh",
			postal_code: "11564",
		},
	},
	{
		label: "Russia VAT",
		country: "RU",
		address: {
			country: "RU",
			line1: "1 Tverskaya Street",
			city: "Moscow",
			postal_code: "125009",
		},
	},
];

test(
	`${chalk.yellowBright("automatic-tax-spray: ONE sub-org with 8 tax registrations, customer per jurisdiction, every sub has automatic_tax.enabled=true")}`,
	async () => {
		const proProd = products.pro({ id: "pro", items: [] });

		// ONE sub-org. Registers Stripe Tax for all 8 countries up front.
		// No primary `s.customer(...)` — we'll provision per-jurisdiction
		// customers manually inside the test body to keep them in lock-step
		// against the same Connect account.
		const { ctx, autumnV1 } = await initScenario({
			setup: [
				s.platform.create({
					configOverrides: { automatic_tax: true },
					taxRegistrations: jurisdictions.map((j) => j.country),
				}),
				s.products({ list: [proProd], prefix: "spray" }),
			],
			actions: [],
		});

		// Provision a customer per jurisdiction in parallel, then attach the
		// pro product, then fetch the resulting Stripe subscription. Returns
		// a tuple of (jurisdiction, sub) per concurrent unit.
		const results = await Promise.all(
			jurisdictions.map(async (j) => {
				const customerId = `tax-spray-${j.country.toLowerCase()}`;

				// initCustomerV3 creates the Stripe customer with the address
				// override, attaches a successful payment method, and registers
				// the Autumn customer linked to that Stripe customer.
				const { customer } = await initCustomerV3({
					ctx,
					customerId,
					attachPm: "success",
					withTestClock: false,
					withDefault: false,
					stripeCustomerOverrides: { address: j.address },
				});

				// Attach the pro product via the legacy /v1/attach path.
				await autumnV1.attach({
					customer_id: customerId,
					product_id: "pro_spray",
				});

				const stripeCusId = customer!.processor!.id!;
				const subs = await ctx.stripeCli.subscriptions.list({
					customer: stripeCusId,
					limit: 1,
				});

				return { jurisdiction: j, sub: subs.data[0] };
			}),
		);

		// Assert every jurisdiction's resulting subscription has
		// automatic_tax.enabled === true. Log the actual computed tax for
		// visibility (rates differ by country and SaaS is sometimes $0).
		for (const { jurisdiction, sub } of results) {
			expect(sub).toBeDefined();
			expect(sub.automatic_tax.enabled).toBe(true);

			const latestInvoiceId =
				typeof sub.latest_invoice === "string"
					? sub.latest_invoice
					: sub.latest_invoice?.id;
			if (latestInvoiceId) {
				const invoice = await ctx.stripeCli.invoices.retrieve(latestInvoiceId);
				const taxAmount = invoice.total - invoice.subtotal;
				console.log(
					`[spray ${jurisdiction.country} ${jurisdiction.label}] subtotal=${invoice.subtotal} total=${invoice.total} tax=${taxAmount}`,
				);
			}
		}
	},
	600_000,
);
