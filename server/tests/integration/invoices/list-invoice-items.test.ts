/**
 * invoices.list returns `items` built from stored invoice_line_items.
 *
 * Contract (per item):
 *   description, period_start, period_end, feature_id, feature_name
 *   plan_id      ← invoice_line_items.product_id
 *   quantity     ← paid_quantity (null on fixed lines)
 *   amount       ← amount (pre-discount, pre-tax)
 *   entities[]   ← invoice_line_items.entities
 *
 * Red (current):  `items` absent from the list response.
 * Green (after):  items match the stored rows for that invoice.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3, ApiListInvoiceV1 } from "@autumn/shared";
import { calculateExpectedInvoiceAmount } from "@tests/integration/billing/utils/calculateExpectedInvoiceAmount";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { waitForInvoiceLineItems } from "@tests/integration/billing/utils/expectInvoiceLineItemsCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("invoices.list items: per-entity usage lines expose plan_id/quantity/amount/entities")}`,
	async () => {
		const customerId = "inv-list-items";

		const consumableWords = items.consumableWords({ includedUsage: 50 });
		const pro = products.pro({
			id: "pro-list-items",
			items: [consumableWords],
		});
		const aliceWords = 250;

		const { autumnV1, autumnV2_3, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({ productId: pro.id, entityIndex: 0 }),
				s.billing.attach({ productId: pro.id, entityIndex: 1 }),
				s.track({
					featureId: TestFeature.Words,
					value: aliceWords,
					entityIndex: 0,
					timeout: 5000,
				}),
				s.advanceToNextInvoice({ withPause: true }),
			],
		});
		const [alice] = entities;

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({ customer, count: 3 });
		const renewalStripeId = customer.invoices![0].stripe_id;
		const rows = await waitForInvoiceLineItems({
			stripeInvoiceId: renewalStripeId,
		});

		const { list } = (await autumnV2_3.post("/invoices.list", {
			customer_id: customerId,
		})) as { list: ApiListInvoiceV1[] };
		const renewal = list.find((inv) => inv.stripe_id === renewalStripeId)!;
		expect(renewal).toBeDefined();
		expect(renewal.items).toBeDefined();
		expect(renewal.items!.length).toBe(rows.length);

		const expectedAlice = calculateExpectedInvoiceAmount({
			items: [consumableWords],
			usage: [{ featureId: TestFeature.Words, value: aliceWords }],
			options: { includeFixed: false, onlyArrear: true },
		});
		const wordsItem = renewal.items!.find(
			(i) => i.feature_id === TestFeature.Words,
		)!;
		expect(wordsItem).toEqual({
			description: expect.any(String),
			period_start: expect.any(Number),
			period_end: expect.any(Number),
			plan_id: pro.id,
			feature_id: TestFeature.Words,
			feature_name: expect.any(String),
			quantity: aliceWords - 50,
			amount: expectedAlice,
			entities: [
				{
					entity_id: alice.id,
					quantity: aliceWords - 50,
					amount: expectedAlice,
				},
			],
		});

		const baseItem = renewal.items!.find((i) => i.feature_id === null)!;
		expect(baseItem.plan_id).toBe(pro.id);
		expect(baseItem.quantity).toBeNull();
		expect(baseItem.amount).toBe(40);

		// Every item mirrors its stored row one-to-one
		for (const row of rows) {
			const item = renewal.items!.find(
				(i) => i.description === row.description,
			)!;
			expect(item.amount).toBe(row.amount);
			expect(item.entities).toEqual(row.entities);
		}

		// Older invoices (attach invoices here) still get items, older-than-storage ones would get []
		for (const inv of list) expect(Array.isArray(inv.items)).toBe(true);
	},
);
