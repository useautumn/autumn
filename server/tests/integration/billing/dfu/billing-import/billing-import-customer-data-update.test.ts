/**
 * billing.import — `customer_data` must update an EXISTING customer's identity
 * fields, not just seed them at creation.
 *
 * Red (pre-fix): upsertFullCustomer only read customer_data on the create path,
 * so name/email sent for an existing customer were silently dropped.
 * Green: existing customer's name/email reflect the imported customer_data.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import {
	callFlash,
	type FlashClient,
} from "@tests/integration/billing/dfu/billing-import/utils/flashTestUtils.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("billing.import: customer_data updates an existing customer")}`,
	async () => {
		const customerId = "dfu-flash-cusdata-update";
		const free = products.base({
			id: "dfu-cusdata-free",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_2, autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({
					testClock: false,
					name: "Old Name",
					email: "old-cusdata@example.com",
				}),
				s.products({ list: [free] }),
			],
			actions: [],
		});

		const payload = {
			customer_id: customerId,
			customer_data: { name: "Stripe Test", email: "stripetest@gmail.com" },
			billables: [
				{
					plan: {
						plan_id: free.id,
						status: "active",
						started_at: Date.now() - 1000 * 60 * 60 * 24 * 30,
						balances: [{ feature_id: TestFeature.Messages, usage: 10 }],
					},
				},
			],
		};

		const flashRes = await callFlash(autumnV2_2 as FlashClient, payload);
		expect(flashRes.errorCode).toBeNull();

		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expect(customer.name).toBe("Stripe Test");
		expect(customer.email).toBe("stripetest@gmail.com");
	},
);
