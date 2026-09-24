/**
 * customers.update billing_details proxies straight to the linked Stripe customer;
 * expand=billing_details reads it back live.
 *
 * Contract:
 *   address:            replaces the whole address (as Stripe does), null clears
 *   tax_exempt:         set as-is
 *   invoice_settings:   custom_fields replace the list, null clears, land on the Stripe customer
 *   tax_ids:            add/remove only touch the listed ids; others are kept, duplicates and
 *                       missing removals are ignored
 */

import { expect, test } from "bun:test";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { expectBillingDetailsCorrect } from "./utils/expectBillingDetailsCorrect.js";

const FULL_ADDRESS = {
	line1: "1 Main St",
	line2: null,
	city: "Berlin",
	state: null,
	postal_code: "10115",
	country: "DE",
};

test.concurrent(
	`${chalk.yellowBright("billing details: address, tax_exempt and invoice custom fields")}`,
	async () => {
		const { customerId, autumnV2_3, ctx } = await initScenario({
			customerId: "billing-details-update",
			setup: [s.customer({ testClock: false })],
			actions: [],
		});

		await autumnV2_3.customers.update(customerId, {
			billing_details: {
				address: {
					line1: "1 Main St",
					city: "Berlin",
					postal_code: "10115",
					country: "DE",
				},
				tax_exempt: "reverse",
				invoice_settings: {
					custom_fields: [{ name: "PO Number", value: "4500463831" }],
				},
			},
		});

		const customer = await expectBillingDetailsCorrect({
			autumn: autumnV2_3,
			customerId,
			expected: {
				address: FULL_ADDRESS,
				tax_exempt: "reverse",
				invoice_settings: {
					custom_fields: [{ name: "PO Number", value: "4500463831" }],
				},
			},
		});

		const stripeCustomer = await ctx.stripeCli.customers.retrieve(
			customer.stripe_id as string,
		);
		expect(
			"deleted" in stripeCustomer
				? null
				: stripeCustomer.invoice_settings.custom_fields,
		).toEqual([{ name: "PO Number", value: "4500463831" }]);

		await autumnV2_3.customers.updateRpc(customerId, {
			billing_details: {
				address: { city: "Munich", country: "DE" },
				invoice_settings: { custom_fields: null },
			},
		});

		await expectBillingDetailsCorrect({
			autumn: autumnV2_3,
			customerId,
			expected: {
				address: {
					...FULL_ADDRESS,
					line1: null,
					postal_code: null,
					city: "Munich",
				},
				tax_exempt: "reverse",
			},
		});

		await autumnV2_3.customers.update(customerId, {
			billing_details: { address: null, tax_exempt: "none" },
		});

		await expectBillingDetailsCorrect({
			autumn: autumnV2_3,
			customerId,
			expected: {},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("billing details: tax_ids add and remove only touch listed ids")}`,
	async () => {
		const { customerId, autumnV2_3 } = await initScenario({
			customerId: "billing-details-tax-ids",
			setup: [s.customer({ testClock: false })],
			actions: [],
		});

		const germanVat = { type: "eu_vat", value: "DE123456789" };
		const frenchVat = { type: "eu_vat", value: "FRAB123456789" };
		const ukVat = { type: "gb_vat", value: "GB123456789" };

		await autumnV2_3.customers.update(customerId, {
			billing_details: { tax_ids: { add: [germanVat, ukVat] } },
		});
		await expectBillingDetailsCorrect({
			autumn: autumnV2_3,
			customerId,
			expected: { tax_ids: [germanVat, ukVat] },
		});

		await autumnV2_3.customers.update(customerId, {
			billing_details: {
				tax_ids: { add: [frenchVat, ukVat], remove: [germanVat] },
			},
		});
		await expectBillingDetailsCorrect({
			autumn: autumnV2_3,
			customerId,
			expected: { tax_ids: [frenchVat, ukVat] },
		});

		await autumnV2_3.customers.update(customerId, {
			billing_details: { tax_ids: { remove: [frenchVat, germanVat] } },
		});
		await expectBillingDetailsCorrect({
			autumn: autumnV2_3,
			customerId,
			expected: { tax_ids: [ukVat] },
		});
	},
);
