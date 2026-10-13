import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectSubCount,
	expectSubToBeCorrect,
} from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// 3.3 Remove base price (paid to free)
test.concurrent(
	`${chalk.yellowBright("p2p: remove base price (to free)")}`,
	async () => {
		const messagesItem = items.monthlyMessages({ includedUsage: 100 });
		const priceItem = items.monthlyPrice({ price: 20 });
		const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

		const { customerId, autumnV1, ctx } = await initScenario({
			customerId: "p2p-remove-price",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.attach({ productId: "pro" })],
		});

		// Track some usage
		const messagesUsage = 50;
		await autumnV1.track(
			{
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: messagesUsage,
			},
			{ timeout: 2000 },
		);

		// Remove price, keep only messages
		const updateParams = {
			customer_id: customerId,
			product_id: pro.id,
			items: [messagesItem],
		};

		const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

		// Should credit full $20 (refund for unused portion)
		expect(preview.total).toBe(-20);

		await autumnV1.subscriptions.update(updateParams);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// Usage should stay the same
		await expectCustomerFeatureCorrect({
			autumn: autumnV1,
			customerId,
			featureId: TestFeature.Messages,
			includedUsage: messagesItem.included_usage,
			balance: messagesItem.included_usage - messagesUsage,
			usage: messagesUsage,
		});

		// Now free, should have no Stripe subscription
		await expectSubCount({
			ctx,
			customerId,
			count: 0,
		});
	},
);

// 2.3 Change to unlimited
test.concurrent(
	`${chalk.yellowBright("p2p: change to unlimited")}`,
	async () => {
		const messagesItem = items.monthlyMessages({ includedUsage: 100 });
		const priceItem = items.monthlyPrice({ price: 20 });
		const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

		const { customerId, autumnV1, ctx } = await initScenario({
			customerId: "p2p-to-unlimited",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.attach({ productId: "pro" })],
		});

		// Track some usage
		const messagesUsage = 90;
		await autumnV1.track(
			{
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: messagesUsage,
			},
			{ timeout: 2000 },
		);

		// Change to unlimited
		const unlimitedMessagesItem = items.unlimitedMessages();

		const updateParams = {
			customer_id: customerId,
			product_id: pro.id,
			items: [unlimitedMessagesItem, priceItem],
		};

		const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

		// Changing to unlimited has no price impact
		expect(preview.total).toBe(0);

		await autumnV1.subscriptions.update(updateParams);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// Messages should now be unlimited
		expect(customer.features[TestFeature.Messages].unlimited).toBe(true);

		// Verify invoice matches preview
		await expectCustomerInvoiceCorrect({
			customer,
			count: 2,
			latestTotal: preview.total,
		});

		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
);
