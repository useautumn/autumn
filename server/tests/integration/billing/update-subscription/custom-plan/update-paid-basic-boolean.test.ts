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
// PAID-TO-PAID: BOOLEAN FEATURE ADD/REMOVE
// ═══════════════════════════════════════════════════════════════════════════════

// 1.1 Add boolean feature to paid plan
test.concurrent(
	`${chalk.yellowBright("p2p: add boolean feature")}`,
	async () => {
		const messagesItem = items.monthlyMessages({ includedUsage: 100 });
		const priceItem = items.monthlyPrice({ price: 20 });
		const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

		const { customerId, autumnV1, ctx } = await initScenario({
			customerId: "p2p-add-bool",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.attach({ productId: "pro" })],
		});

		// Track some usage before update
		const messagesUsage = 35;
		await autumnV1.track(
			{
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: messagesUsage,
			},
			{ timeout: 2000 },
		);

		// Get original reset time
		const customerBefore =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		const originalResetAt =
			customerBefore.features[TestFeature.Messages].next_reset_at;
		expect(originalResetAt).toBeDefined();

		// Add boolean dashboard feature
		const dashboardItem = items.dashboard();

		const updateParams = {
			customer_id: customerId,
			product_id: pro.id,
			items: [messagesItem, priceItem, dashboardItem],
		};

		const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

		// Boolean features have no price impact
		expect(preview.total).toBe(0);

		await autumnV1.subscriptions.update(updateParams);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// Messages usage should stay the same
		await expectCustomerFeatureCorrect({
			autumn: autumnV1,
			customerId,
			featureId: TestFeature.Messages,
			includedUsage: messagesItem.included_usage,
			balance: messagesItem.included_usage - messagesUsage,
			usage: messagesUsage,
			resetsAt: originalResetAt!,
		});

		// Dashboard should be accessible (boolean feature)
		expect(customer.features[TestFeature.Dashboard]).toBeDefined();

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

// 1.2 Remove boolean feature from paid plan
test.concurrent(
	`${chalk.yellowBright("p2p: remove boolean feature")}`,
	async () => {
		const messagesItem = items.monthlyMessages({ includedUsage: 100 });
		const priceItem = items.monthlyPrice({ price: 20 });
		const dashboardItem = items.dashboard();
		const pro = products.base({
			id: "pro",
			items: [messagesItem, priceItem, dashboardItem],
		});

		const { customerId, autumnV1, ctx } = await initScenario({
			customerId: "p2p-remove-bool",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.attach({ productId: "pro" })],
		});

		// Track some usage before update
		const messagesUsage = 60;
		await autumnV1.track(
			{
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: messagesUsage,
			},
			{ timeout: 2000 },
		);

		// Get original reset time
		const customerBefore =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		const originalResetAt =
			customerBefore.features[TestFeature.Messages].next_reset_at;

		// Verify dashboard is accessible before
		expect(customerBefore.features[TestFeature.Dashboard]).toBeDefined();

		// Remove dashboard feature
		const updateParams = {
			customer_id: customerId,
			product_id: pro.id,
			items: [messagesItem, priceItem],
		};

		const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

		// Boolean features have no price impact
		expect(preview.total).toBe(0);

		await autumnV1.subscriptions.update(updateParams);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// Messages usage should stay the same
		await expectCustomerFeatureCorrect({
			autumn: autumnV1,
			customerId,
			featureId: TestFeature.Messages,
			includedUsage: messagesItem.included_usage,
			balance: messagesItem.included_usage - messagesUsage,
			usage: messagesUsage,
			resetsAt: originalResetAt!,
		});

		// Dashboard should no longer be accessible
		expect(customer.features[TestFeature.Dashboard]).toBeUndefined();

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
