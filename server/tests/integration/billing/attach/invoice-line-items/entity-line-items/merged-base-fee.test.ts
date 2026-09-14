/**
 * Two entities on the same $20 plan merge into one "2 × Pro" $40 Stripe line.
 *
 * Contract:
 *   stored row links BOTH customer products and has two $20 entity entries
 *   cancelling one entity mid-cycle credits its $20 share, not the $40 line
 *
 * Red (current):  row links one product, entities has one entry, credit is on $40.
 * Green (after):  two ids, two entries, credit = prorate($20).
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { waitForInvoiceLineItems } from "@tests/integration/billing/utils/expectInvoiceLineItemsCorrect";
import { calculateProrationFromPeriod } from "@tests/integration/billing/utils/proration/calculateProration";
import { getBillingPeriod } from "@tests/integration/billing/utils/proration/getBillingPeriod";
import { TestFeature } from "@tests/setup/v2Features";
import { hoursToFinalizeInvoice } from "@tests/utils/constants";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addDays, addHours, addMonths } from "date-fns";

test.concurrent(
	`${chalk.yellowBright("entity-li: merged base fee → one line, one entry per entity, credit on own share")}`,
	async () => {
		const customerId = "entity-li-merged";
		const basePrice = 20;

		const pro = products.pro({
			id: "pro-merged",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const { autumnV1, entities, testClockId, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: true, paymentMethod: "success" }),
				s.products({ list: [pro] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({ productId: pro.id, entityIndex: 0 }),
				s.billing.attach({ productId: pro.id, entityIndex: 1 }),
			],
		});
		const [alice, bob] = entities;

		const renewalTime = await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			advanceTo: addHours(
				addMonths(new Date(advancedTo), 1),
				hoursToFinalizeInvoice,
			).getTime(),
			waitForSeconds: 30,
		});

		const renewalInvoices = await ctx.stripeCli.invoices.list({
			customer: (await autumnV1.customers.get<ApiCustomerV3>(customerId))
				.stripe_id!,
			limit: 1,
		});
		const renewalStripeId = renewalInvoices.data[0].id!;
		const rows = await waitForInvoiceLineItems({
			stripeInvoiceId: renewalStripeId,
		});

		const merged = rows.find(
			(li) => li.feature_id === null && li.amount === basePrice * 2,
		)!;
		expect(merged).toBeDefined();
		expect(merged.customer_product_ids.length).toBe(2);
		expect(
			[...merged.entities].sort((a, b) =>
				a.entity_id.localeCompare(b.entity_id),
			),
		).toEqual(
			[alice.id, bob.id]
				.sort()
				.map((entity_id) => ({ entity_id, quantity: null, amount: basePrice })),
		);

		// Cancel alice 15 days in: credit must be her $20 share, not the $40 line
		const cancelAt = addDays(new Date(renewalTime), 15).getTime();
		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			startingFrom: new Date(renewalTime),
			numberOfDays: 15,
		});
		const { billingPeriod } = await getBillingPeriod({ customerId });
		const expectedCredit = -calculateProrationFromPeriod({
			billingPeriod,
			advancedTo: cancelAt,
			amount: basePrice,
		});

		const preview = await autumnV1.subscriptions.previewUpdate({
			customer_id: customerId,
			product_id: pro.id,
			entity_id: alice.id,
			cancel_action: "cancel_immediately",
		});
		expect(preview.total).toBe(expectedCredit);
	},
);
