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

// Paid-to-paid: allocated/seat-based updates.

// ═══════════════════════════════════════════════════════════════════════════════
// USAGE WITHIN INCLUDED (usage < included)
// ═══════════════════════════════════════════════════════════════════════════════

// Update when usage < included, staying within included
test.concurrent(
	`${chalk.yellowBright("allocated: increase allowance when usage < included")}`,
	async () => {
		const allocatedUsersItem = items.allocatedUsers({ includedUsage: 5 });
		const priceItem = items.monthlyPrice({ price: 20 });
		const pro = products.base({
			id: "pro",
			items: [allocatedUsersItem, priceItem],
		});

		const { customerId, autumnV1, ctx } = await initScenario({
			customerId: "alloc-inc-within",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.attach({ productId: "pro" })],
		});

		// Use 2 seats (within the 5 included)
		const seatsUsed = 2;
		await autumnV1.track(
			{
				customer_id: customerId,
				feature_id: TestFeature.Users,
				value: seatsUsed,
			},
			{ timeout: 2000 },
		);

		// Increase to 10 included seats
		const newAllocatedUsersItem = items.allocatedUsers({ includedUsage: 10 });

		const updateParams = {
			customer_id: customerId,
			product_id: pro.id,
			items: [newAllocatedUsersItem, priceItem],
		};

		const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

		// No price change - usage still within included
		expect(preview.total).toBe(0);

		await autumnV1.subscriptions.update(updateParams);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// Usage preserved, more capacity available
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Users,
			includedUsage: newAllocatedUsersItem.included_usage,
			balance: newAllocatedUsersItem.included_usage - seatsUsed, // 10 - 2 = 8
			usage: seatsUsed,
		});

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

// Decrease allowance but usage still within new included
test.concurrent(
	`${chalk.yellowBright("allocated: decrease allowance, usage still within included")}`,
	async () => {
		const allocatedUsersItem = items.allocatedUsers({ includedUsage: 10 });
		const priceItem = items.monthlyPrice({ price: 20 });
		const pro = products.base({
			id: "pro",
			items: [allocatedUsersItem, priceItem],
		});

		const { customerId, autumnV1, ctx } = await initScenario({
			customerId: "alloc-dec-within",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.attach({ productId: "pro" })],
		});

		// Use 3 seats (within the 10 included)
		const seatsUsed = 3;
		await autumnV1.track(
			{
				customer_id: customerId,
				feature_id: TestFeature.Users,
				value: seatsUsed,
			},
			{ timeout: 2000 },
		);

		// Decrease to 5 included seats (still covers the 3 used)
		const newAllocatedUsersItem = items.allocatedUsers({ includedUsage: 5 });

		const updateParams = {
			customer_id: customerId,
			product_id: pro.id,
			items: [newAllocatedUsersItem, priceItem],
		};

		const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

		// No price change - usage (3) still within new included (5)
		expect(preview.total).toBe(0);

		await autumnV1.subscriptions.update(updateParams);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Users,
			includedUsage: newAllocatedUsersItem.included_usage,
			balance: newAllocatedUsersItem.included_usage - seatsUsed, // 5 - 3 = 2
			usage: seatsUsed,
		});

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
