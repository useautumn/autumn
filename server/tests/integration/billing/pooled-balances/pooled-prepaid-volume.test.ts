/**
 * Pooled prepaid volume bands on total quantity including the allowance, every pack at that band.
 * Pooled pay-per-use volume is rejected by design.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectInvoiceLineItemsCorrect } from "@tests/integration/billing/utils/expectInvoiceLineItemsCorrect";
import { expectNextInvoiceMatchesPreview } from "@tests/integration/billing/utils/expectNextInvoiceMatchesPreview";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const INCLUDED = 100;
const BILLING_UNITS = 100;

test.concurrent(
	`${chalk.yellowBright("pooled-prepaid-volume 1: 700 total (100 pooled included) lands in band 2, attach and renewal preview = invoice")}`,
	async () => {
		const customerId = "pooled-prepaid-volume";
		const quantity = 700;
		// Net tiers 0-500/501+ are total bands 0-600/601+: 7 packs × $5 = $35
		const expectedFeatureAmount = 35;

		const pooledVolumeItem = {
			...items.volumePrepaidMessages({
				includedUsage: INCLUDED,
				billingUnits: BILLING_UNITS,
			}),
			pooled: true,
		};
		const plan = products.base({
			id: "pooled-prepaid-volume",
			items: [pooledVolumeItem],
		});

		const { autumnV1, autumnV2_2, ctx, testClockId, advancedTo, entities } =
			await initScenario({
				customerId,
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.entities({ count: 1, featureId: TestFeature.Users }),
					s.products({ list: [plan] }),
				],
				actions: [],
			});

		const attachParams = {
			customer_id: customerId,
			product_id: plan.id,
			entity_id: entities[0].id,
			options: [{ feature_id: TestFeature.Messages, quantity }],
		};
		const attachPreview = await autumnV1.billing.previewAttach(attachParams);
		const previewFeatureLine = attachPreview.line_items.find(
			(lineItem: { feature_id: string | null }) =>
				lineItem.feature_id === TestFeature.Messages,
		);
		expect(previewFeatureLine?.subtotal).toBeCloseTo(expectedFeatureAmount, 2);
		expect(attachPreview.total).toBeCloseTo(expectedFeatureAmount, 2);

		await autumnV1.billing.attach(attachParams);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(customer.features[TestFeature.Messages]?.balance).toBe(quantity);
		const attachInvoice = customer.invoices![0];
		expect(attachInvoice.total).toBeCloseTo(attachPreview.total, 2);
		await expectInvoiceLineItemsCorrect({
			stripeInvoiceId: attachInvoice.stripe_id,
			expectedTotal: attachPreview.total,
			expectedLineItems: [
				{
					featureId: TestFeature.Messages,
					totalAmount: expectedFeatureAmount,
				},
			],
		});

		const { renewalInvoice } = await expectNextInvoiceMatchesPreview({
			ctx,
			autumnV1,
			autumnV2_2,
			customerId,
			testClockId: testClockId!,
			advancedTo,
			featureId: TestFeature.Messages,
			expectedFeatureAmount,
		});
		await expectInvoiceLineItemsCorrect({
			stripeInvoiceId: renewalInvoice.stripe_id,
			expectedTotal: renewalInvoice.total,
			expectedLineItems: [
				{
					featureId: TestFeature.Messages,
					totalAmount: expectedFeatureAmount,
				},
			],
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("pooled-prepaid-volume 2: pooled pay-per-use volume is rejected with 400")}`,
	async () => {
		const { autumnV1 } = await initScenario({
			customerId: "pooled-pay-per-use-volume",
			setup: [s.customer({ testClock: false })],
			actions: [],
		});
		const planId = `pooled-ppu-volume-${crypto.randomUUID()}`;

		const response = await fetch(`${autumnV1.baseUrl}/products`, {
			method: "POST",
			headers: autumnV1.headers,
			body: JSON.stringify({
				...products.base({
					id: planId,
					items: [
						{
							...items.volumeConsumableMessages({ includedUsage: INCLUDED }),
							pooled: true,
						},
					],
				}),
				name: planId,
			}),
		});

		expect(response.status).toBe(400);
		const body = await response.json();
		expect(body.message).toInclude(
			"Pooled items cannot use usage-based pricing",
		);
	},
);
