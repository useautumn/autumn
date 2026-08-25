/** One aggregate entry is kept per stable source ID; direct pool tracks are
 * attributed 1:1, and refunds change only their source entry. */

import { expect, test } from "bun:test";
import { customerEntitlements } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import { and, eq } from "drizzle-orm";

test.concurrent(
	"invoice-credit attribution aggregates multiple sources and isolated refunds",
	async () => {
		const customerId = "invoice-credit-flat-attribution";
		const product = products.base({
			id: "invoice-credit-flat-attribution",
			items: [
				items.consumable({
					featureId: TestFeature.InvoiceCredits,
					includedUsage: 1_000,
					price: 1,
					billingUnits: 1,
				}),
			],
		});
		const { autumnV2_3, customer, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [product] }),
			],
			actions: [s.billing.attach({ productId: product.id })],
		});

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 100,
		});
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Action2,
			value: 100,
		});
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.InvoiceCredits,
			value: 10,
		});
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: -50,
		});

		await timeout(3_000);
		const [persisted] = await ctx.db
			.select({
				balance: customerEntitlements.balance,
				usageAttribution: customerEntitlements.usage_attribution,
			})
			.from(customerEntitlements)
			.where(
				and(
					eq(customerEntitlements.internal_customer_id, customer.internal_id),
					eq(customerEntitlements.feature_id, TestFeature.InvoiceCredits),
				),
			)
			.limit(1);

		const internalId = (featureId: TestFeature) =>
			ctx.features.find((feature) => feature.id === featureId)?.internal_id;
		const action1InternalId = internalId(TestFeature.Action1);
		const action2InternalId = internalId(TestFeature.Action2);
		const invoiceCreditsInternalId = internalId(TestFeature.InvoiceCredits);
		expect(action1InternalId).toBeDefined();
		expect(action2InternalId).toBeDefined();
		expect(invoiceCreditsInternalId).toBeDefined();

		expect(persisted?.balance).toBeCloseTo(920, 10);
		expect(persisted?.usageAttribution).toEqual({
			[action1InternalId!]: { units: 50, credits: 10 },
			[action2InternalId!]: { units: 100, credits: 60 },
			[invoiceCreditsInternalId!]: { units: 10, credits: 10 },
		});
	},
	{ timeout: 120_000 },
);
