import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// PAID-TO-PAID: INCLUDED USAGE SHIFTS
// ═══════════════════════════════════════════════════════════════════════════════

// 4.8 Shift included usage up (50 -> 200)
test.concurrent(
	`${chalk.yellowBright("p2p: shift included usage up")}`,
	async () => {
		const consumableItem = items.consumableMessages({ includedUsage: 50 });
		const priceItem = items.monthlyPrice({ price: 20 });
		const pro = products.base({
			id: "pro",
			items: [consumableItem, priceItem],
		});

		const { customerId, autumnV1, ctx } = await initScenario({
			customerId: "p2p-shift-inc-up",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.attach({ productId: "pro" })],
		});

		// Track usage that puts us in overage (80 used, 50 included = 30 overage)
		const messagesUsage = 80;
		await autumnV1.track(
			{
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: messagesUsage,
			},
			{ timeout: 2000 },
		);

		// Shift included up to 200 - should cover existing usage
		const newConsumableItem = items.consumableMessages({ includedUsage: 200 });

		const updateParams = {
			customer_id: customerId,
			product_id: pro.id,
			items: [newConsumableItem, priceItem],
		};

		const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

		// No price change, just included usage shift
		expect(preview.total).toBe(0);

		await autumnV1.subscriptions.update(updateParams);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// Usage preserved, now within included
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			includedUsage: newConsumableItem.included_usage,
			balance: newConsumableItem.included_usage - messagesUsage, // 200 - 80 = 120
			usage: messagesUsage,
		});

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

// 4.9 Shift included usage down (200 -> 50) into overage
test.concurrent(
	`${chalk.yellowBright("p2p: shift included usage down into overage")}`,
	async () => {
		const consumableItem = items.consumableMessages({ includedUsage: 200 });
		const priceItem = items.monthlyPrice({ price: 20 });
		const pro = products.base({
			id: "pro",
			items: [consumableItem, priceItem],
		});

		const { customerId, autumnV1, ctx } = await initScenario({
			customerId: "p2p-shift-inc-down",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.attach({ productId: "pro" })],
		});

		// Track usage within included (80 used, 200 included)
		const messagesUsage = 80;
		await autumnV1.track(
			{
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: messagesUsage,
			},
			{ timeout: 2000 },
		);

		// Shift included down to 50 - puts existing usage into overage
		const newConsumableItem = items.consumableMessages({ includedUsage: 50 });

		const updateParams = {
			customer_id: customerId,
			product_id: pro.id,
			items: [newConsumableItem, priceItem],
		};

		const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

		// No price change, just included usage shift (consumable overage not charged on update)
		expect(preview.total).toBe(0);

		await autumnV1.subscriptions.update(updateParams);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// Usage preserved, now in overage (80 used, 50 included = 30 overage)
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			includedUsage: newConsumableItem.included_usage,
			balance: newConsumableItem.included_usage - messagesUsage, // 50 - 80 = -30
			usage: messagesUsage,
		});

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

// ═══════════════════════════════════════════════════════════════════════════════
// PAID-TO-PAID: OVERAGE BILLING MID-CYCLE
// ═══════════════════════════════════════════════════════════════════════════════

// 5.1 Mid-cycle update with pending overage
test.concurrent(
	`${chalk.yellowBright("p2p: mid-cycle update with pending overage")}`,
	async () => {
		const consumableItem = items.consumableMessages({ includedUsage: 50 });
		const priceItem = items.monthlyPrice({ price: 20 });
		const pro = products.base({
			id: "pro",
			items: [consumableItem, priceItem],
		});

		const { customerId, autumnV1, ctx } = await initScenario({
			customerId: "p2p-pending-overage",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.attach({ productId: "pro" })],
		});

		// Track usage that goes over included (50 included, use 80 = 30 overage @ $0.10 = $3)
		const messagesUsage = 80;
		await autumnV1.track(
			{
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: messagesUsage,
			},
			{ timeout: 2000 },
		);

		// Update to different consumable config
		const newConsumableItem = items.consumableMessages({ includedUsage: 100 });

		const updateParams = {
			customer_id: customerId,
			product_id: pro.id,
			items: [newConsumableItem, priceItem],
		};

		const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

		// Preview should NOT include overage charge (consumable overage not charged on update)
		expect(preview.total).toBe(0);

		await autumnV1.subscriptions.update(updateParams);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// Usage preserved, now within included
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			includedUsage: newConsumableItem.included_usage,
			balance: newConsumableItem.included_usage - messagesUsage,
			usage: messagesUsage,
		});

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

// 5.2 Update consumable to more included covers overage
test.concurrent(
	`${chalk.yellowBright("p2p: update to more included covers overage")}`,
	async () => {
		const consumableItem = items.consumableMessages({ includedUsage: 50 });
		const priceItem = items.monthlyPrice({ price: 20 });
		const pro = products.base({
			id: "pro",
			items: [consumableItem, priceItem],
		});

		const { customerId, autumnV1, ctx } = await initScenario({
			customerId: "p2p-cover-overage",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.attach({ productId: "pro" })],
		});

		// Track usage that goes over (80 used with 50 included = 30 overage)
		const messagesUsage = 80;
		await autumnV1.track(
			{
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: messagesUsage,
			},
			{ timeout: 2000 },
		);

		// Verify customer is over their limit
		const customerBefore =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(customerBefore.features[TestFeature.Messages].balance).toBeLessThan(
			0,
		);

		// Update to 100 included - should now cover the usage
		const newConsumableItem = items.consumableMessages({ includedUsage: 100 });

		const updateParams = {
			customer_id: customerId,
			product_id: pro.id,
			items: [newConsumableItem, priceItem],
		};

		const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

		// No price change (consumable overage not charged on update)
		expect(preview.total).toBe(0);

		await autumnV1.subscriptions.update(updateParams);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// Now usage is within included
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			includedUsage: newConsumableItem.included_usage,
			balance: newConsumableItem.included_usage - messagesUsage, // 100 - 80 = 20
			usage: messagesUsage,
		});

		// Balance should now be positive
		expect(customer.features[TestFeature.Messages].balance).toBeGreaterThan(0);

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
