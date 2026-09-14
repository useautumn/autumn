/**
 * A mid-cycle upgrade issues a proration credit for the old plan: negative amount, same entity as the line it prorates.
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
	`${chalk.yellowBright("entity-li: proration credit → negative amount attributed to the same entity")}`,
	async () => {
		const customerId = "entity-li-proration";
		const premium = products.premium({
			id: "premium-pr",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const pro = products.pro({
			id: "pro-pr",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV1, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [premium, pro] }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({ productId: pro.id, entityIndex: 0 }),
				s.advanceTestClock({ days: 10, waitForSeconds: 15 }),
			],
		});

		const result = await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: premium.id,
			entity_id: entities[0].id,
		});
		expect(result.invoice?.stripe_id).toBeDefined();

		const rows = await waitForInvoiceLineItems({
			stripeInvoiceId: result.invoice!.stripe_id,
		});
		const credit = rows.find((li) => li.direction === "refund")!;
		expect(credit).toBeDefined();
		expect(credit.amount).toBeLessThan(0);
		expect(credit.product_id).toBe(pro.id);
		expect(credit.entities).toEqual([
			{ entity_id: entities[0].id, quantity: null, amount: credit.amount },
		]);

		const charge = rows.find(
			(li) => li.direction === "charge" && li.product_id === premium.id,
		)!;
		expect(charge.entities).toEqual([
			{ entity_id: entities[0].id, quantity: null, amount: charge.amount },
		]);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(customer.invoices!.length).toBe(2);
	},
);
