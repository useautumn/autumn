/**
 * customers.create with billing_details creates the Stripe customer if needed
 * and applies the details before the response is built.
 *
 * Contract:
 *   create (no create_in_stripe) + billing_details -> Stripe customer linked, details set,
 *                                                     returned when expanded in the same call
 */

import { expect, test } from "bun:test";
import { type ApiCustomerV5, CustomerExpand } from "@autumn/shared";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { expectBillingDetailsCorrect } from "./utils/expectBillingDetailsCorrect.js";

test.concurrent(
	`${chalk.yellowBright("billing details: set on create")}`,
	async () => {
		const customerId = "billing-details-create";
		const { autumnV2_3 } = await initScenario({
			setup: [s.deleteCustomer({ customerId })],
			actions: [],
		});

		const germanVat = { type: "eu_vat", value: "DE123456789" };
		const created = (await autumnV2_3.customers.create({
			id: customerId,
			name: "Billing Details Create",
			expand: [CustomerExpand.BillingDetails],
			billing_details: {
				address: { country: "DE", postal_code: "10115" },
				tax_ids: { add: [germanVat] },
			},
		})) as ApiCustomerV5;

		expect(created.stripe_id).toStartWith("cus_");
		expect(created.billing_details?.tax_ids).toEqual([germanVat]);

		await expectBillingDetailsCorrect({
			autumn: autumnV2_3,
			customerId,
			expected: {
				address: {
					line1: null,
					line2: null,
					city: null,
					state: null,
					postal_code: "10115",
					country: "DE",
				},
				tax_ids: [germanVat],
			},
		});
	},
);
