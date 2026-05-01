/**
 * Spray test: `automatic_tax: true` across 8 jurisdictions on ONE sub-org.
 * Verifies that the factory's `taxRegistrations: [...]` array correctly
 * handles multi-country registration and that every per-jurisdiction
 * customer's resulting sub has auto_tax enabled.
 *
 * Coverage: GB, CA, US/CA, AU, FR, DE, SA, RU.
 *
 * Does NOT assert specific tax rates — SaaS is sometimes $0 (e.g. CA), so
 * `tax > 0` would be false-positive prone. Watch run logs for any
 * "Failed to register Stripe Tax" warnings (factory swallows them).
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

		// ONE sub-org with all 8 tax registrations. No primary customer —
		// we provision per-jurisdiction customers in the test body so they
		// share the same Connect account.
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

		// Per-jurisdiction customer + attach + fetch sub, in parallel.
		const results = await Promise.all(
			jurisdictions.map(async (j) => {
				const customerId = `tax-spray-${j.country.toLowerCase()}`;

				const { customer } = await initCustomerV3({
					ctx,
					customerId,
					attachPm: "success",
					withTestClock: false,
					withDefault: false,
					stripeCustomerOverrides: { address: j.address },
				});

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

		// Every jurisdiction's sub has auto_tax enabled. Log computed tax
		// for visibility (SaaS is sometimes $0).
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
