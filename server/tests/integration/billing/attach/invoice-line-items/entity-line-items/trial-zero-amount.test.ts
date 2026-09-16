/**
 * A trial invoice is Stripe's own $0 plan line. Autumn drops the in-advance line
 * at trial start, so there is no context to attribute: plan_id from metadata, entities [].
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { waitForInvoiceLineItems } from "@tests/integration/billing/utils/expectInvoiceLineItemsCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("entity-li: trial → $0 plan line, entities []")}`,
	async () => {
		const customerId = "entity-li-trial";
		const proTrial = products.proWithTrial({
			id: "pro-trial",
			items: [items.monthlyMessages({ includedUsage: 100 })],
			trialDays: 14,
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [proTrial] }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
			],
			actions: [s.billing.attach({ productId: proTrial.id, entityIndex: 0 })],
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(customer.invoices![0].total).toBe(0);
		const rows = await waitForInvoiceLineItems({
			stripeInvoiceId: customer.invoices![0].stripe_id,
		});

		const trialLine = rows.find((li) => li.product_id === proTrial.id)!;
		expect(trialLine).toBeDefined();
		expect(trialLine.amount).toBe(0);
		expect(trialLine.entities).toEqual([]);
	},
);
