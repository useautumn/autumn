/**
 * Pay-per-use volume tiers with entities. An entity-feature item prices the customer
 * total (the sum of every entity's actual usage) on one band; per-entity
 * plans each bill on their own band. Every case checks the upcoming-invoice preview
 * equals the renewal invoice.
 */

import { expect, test } from "bun:test";
import { waitForInvoiceLineItems } from "@tests/integration/billing/utils/expectInvoiceLineItemsCorrect";
import { expectNextInvoiceMatchesPreview } from "@tests/integration/billing/utils/expectNextInvoiceMatchesPreview";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// Default tiers: 0-500 @ $0.10, 501+ @ $0.05, net of included.
test.concurrent(
	`${chalk.yellowBright("volume-entity 1: entity feature, 3 entities × 100 included, one under → band 2 on customer total")}`,
	async () => {
		const customerId = "vol-entity-feature";
		const volumeItem = items.volumeConsumableMessages({
			includedUsage: 100,
			entityFeatureId: TestFeature.Users,
		});
		const pro = products.pro({ id: "pro-vol-entity", items: [volumeItem] });

		const scenario = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
				s.entities({ count: 3, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.warmEntityCaches(),
				s.track({
					featureId: TestFeature.Messages,
					value: 500,
					entityIndex: 0,
				}),
				s.track({
					featureId: TestFeature.Messages,
					value: 300,
					entityIndex: 1,
				}),
				s.track({
					featureId: TestFeature.Messages,
					value: 50,
					entityIndex: 2,
					timeout: 3000,
				}),
			],
		});

		// 500 + 300 + 50 used = 850 > 600 (band 2): 850 × $0.05 = $42.50; the unused 50 isn't billed
		const { preview } = await expectNextInvoiceMatchesPreview({
			ctx: scenario.ctx,
			autumnV1: scenario.autumnV1,
			autumnV2_2: scenario.autumnV2_2,
			customerId,
			testClockId: scenario.testClockId!,
			advancedTo: scenario.advancedTo,
			featureId: TestFeature.Messages,
			expectedFeatureAmount: 42.5,
		});
		// $20 base + $42.50 usage
		expect(preview.total).toBeCloseTo(62.5, 2);
	},
);

test.concurrent(
	`${chalk.yellowBright("volume-entity 2: per-entity plans each bill on their own band")}`,
	async () => {
		const customerId = "vol-entity-plans";
		const volumeItem = items.volumeConsumableMessages({ includedUsage: 100 });
		const pro = products.pro({ id: "pro-vol-ent-plans", items: [volumeItem] });

		const scenario = await initScenario({
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
					featureId: TestFeature.Messages,
					value: 150,
					entityIndex: 0,
				}),
				s.track({
					featureId: TestFeature.Messages,
					value: 700,
					entityIndex: 1,
					timeout: 3000,
				}),
			],
		});

		// Entity 0: 150 ≤ 600 (band 1): 150 × $0.10 = $15. Entity 1: 700 > 600 (band 2): 700 × $0.05 = $35
		const { preview, renewalInvoice } = await expectNextInvoiceMatchesPreview({
			ctx: scenario.ctx,
			autumnV1: scenario.autumnV1,
			autumnV2_2: scenario.autumnV2_2,
			customerId,
			testClockId: scenario.testClockId!,
			advancedTo: scenario.advancedTo,
		});

		const previewUsageSubtotals = preview.line_items
			.filter((lineItem) => lineItem.feature_id === TestFeature.Messages)
			.map((lineItem) => lineItem.subtotal)
			.sort((a, b) => a - b);
		expect(previewUsageSubtotals).toEqual([15, 35]);
		// 2 × $20 base + $15 + $35
		expect(preview.total).toBeCloseTo(90, 2);

		const [entity0, entity1] = scenario.entities;
		const invoiceLineItems = await waitForInvoiceLineItems({
			stripeInvoiceId: renewalInvoice.stripe_id,
		});
		const usageAmountByEntity = Object.fromEntries(
			invoiceLineItems
				.filter((lineItem) => lineItem.feature_id === TestFeature.Messages)
				.map((lineItem) => [lineItem.entities[0]?.entity_id, lineItem.amount]),
		);
		expect(usageAmountByEntity).toEqual({ [entity0.id]: 15, [entity1.id]: 35 });
	},
);
