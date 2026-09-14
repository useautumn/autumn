/**
 * Per-entity usage overage is stored with an entities[] attribution.
 *
 * Contract:
 *   invoice_line_items.entities: { entity_id, quantity, amount }[]
 *   Each entity-level consumable overage line → exactly one entry for that entity.
 *   Entities under allowance produce no line at all.
 *
 * Red (current):  column does not exist; rows have no `entities`.
 * Green (after):  two words lines, one entry each; joe absent.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { calculateExpectedInvoiceAmount } from "@tests/integration/billing/utils/calculateExpectedInvoiceAmount";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { waitForInvoiceLineItems } from "@tests/integration/billing/utils/expectInvoiceLineItemsCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("entity-li: per-entity usage overage → one entities[] entry per billed entity")}`,
	async () => {
		const customerId = "entity-li-usage";

		const consumableWords = items.consumableWords({ includedUsage: 50 });
		const pro = products.pro({
			id: "pro-entity-usage",
			items: [consumableWords],
		});

		const aliceWords = 250;
		const bobWords = 150;

		const { autumnV1, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
				s.entities({ count: 3, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({ productId: pro.id, entityIndex: 0 }),
				s.billing.attach({ productId: pro.id, entityIndex: 1 }),
				s.billing.attach({ productId: pro.id, entityIndex: 2 }),
				s.track({
					featureId: TestFeature.Words,
					value: aliceWords,
					entityIndex: 0,
				}),
				s.track({
					featureId: TestFeature.Words,
					value: bobWords,
					entityIndex: 1,
					timeout: 5000,
				}),
				s.advanceToNextInvoice({ withPause: true }),
			],
		});

		const [alice, bob, joe] = entities;
		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({ customer, count: 4 });

		const renewal = customer.invoices?.[0];
		expect(renewal?.stripe_id).toBeDefined();
		const lineItems = await waitForInvoiceLineItems({
			stripeInvoiceId: renewal!.stripe_id,
		});

		const wordsLines = lineItems.filter(
			(li) => li.feature_id === TestFeature.Words,
		);
		expect(wordsLines.length).toBe(2);

		const expectedAlice = calculateExpectedInvoiceAmount({
			items: [consumableWords],
			usage: [{ featureId: TestFeature.Words, value: aliceWords }],
			options: { includeFixed: false, onlyArrear: true },
		});
		const expectedBob = calculateExpectedInvoiceAmount({
			items: [consumableWords],
			usage: [{ featureId: TestFeature.Words, value: bobWords }],
			options: { includeFixed: false, onlyArrear: true },
		});

		const byEntity = new Map(
			wordsLines.map((li) => [li.entities[0]?.entity_id, li]),
		);
		expect([...byEntity.keys()].sort()).toEqual([alice.id, bob.id].sort());

		const aliceLine = byEntity.get(alice.id)!;
		expect(aliceLine.entities).toEqual([
			{ entity_id: alice.id, quantity: aliceWords - 50, amount: expectedAlice },
		]);
		expect(aliceLine.entities[0].amount).toBe(aliceLine.amount);
		expect(aliceLine.entities[0].quantity).toBe(aliceLine.paid_quantity);

		const bobLine = byEntity.get(bob.id)!;
		expect(bobLine.entities).toEqual([
			{ entity_id: bob.id, quantity: bobWords - 50, amount: expectedBob },
		]);

		// Joe never went over allowance → no usage line references joe.
		// (He still appears on the merged base-fee line, covered by merged-base-fee.test.ts)
		const joeOnUsageLine = wordsLines.some((li) =>
			li.entities.some((e) => e.entity_id === joe.id),
		);
		expect(joeOnUsageLine).toBe(false);
	},
);
