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
// USAGE EXCEEDS INCLUDED (usage > included)
// ═══════════════════════════════════════════════════════════════════════════════

// Increase seat allowance (original test moved from update-paid-features.test.ts)
test.concurrent(
	`${chalk.yellowBright("allocated: increase seat allowance")}`,
	async () => {
		const allocatedUsersItem = items.allocatedUsers({ includedUsage: 2 });
		const priceItem = items.monthlyPrice({ price: 20 });
		const pro = products.base({
			id: "pro",
			items: [allocatedUsersItem, priceItem],
		});

		const { customerId, autumnV1, ctx } = await initScenario({
			customerId: "alloc-inc-seats",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.attach({ productId: "pro" })],
		});

		// Use 2 seats (at the limit)
		const seatsUsed = 2;
		await autumnV1.track(
			{
				customer_id: customerId,
				feature_id: TestFeature.Users,
				value: seatsUsed,
			},
			{ timeout: 2000 },
		);

		// Increase to 5 included seats
		const newAllocatedUsersItem = items.allocatedUsers({ includedUsage: 5 });

		const updateParams = {
			customer_id: customerId,
			product_id: pro.id,
			items: [newAllocatedUsersItem, priceItem],
		};

		const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

		// No price change, just seat increase
		expect(preview.total).toBe(0);

		await autumnV1.subscriptions.update(updateParams);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// Usage preserved, more capacity available
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Users,
			includedUsage: newAllocatedUsersItem.included_usage,
			balance: newAllocatedUsersItem.included_usage - seatsUsed,
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

// Decrease seat allowance below usage (original test moved from update-paid-features.test.ts)
test.concurrent(
	`${chalk.yellowBright("allocated: decrease seat allowance below usage")}`,
	async () => {
		const allocatedUsersItem = items.allocatedUsers({ includedUsage: 5 });
		const priceItem = items.monthlyPrice({ price: 20 });
		const pro = products.base({
			id: "pro",
			items: [allocatedUsersItem, priceItem],
		});

		const { customerId, autumnV1, ctx } = await initScenario({
			customerId: "alloc-dec-seats",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.attach({ productId: "pro" })],
		});

		// Use 5 seats
		const seatsUsed = 5;
		await autumnV1.track(
			{
				customer_id: customerId,
				feature_id: TestFeature.Users,
				value: seatsUsed,
			},
			{ timeout: 2000 },
		);

		// Decrease to 3 included seats (using 5, so 2 extra)
		const newAllocatedUsersItem = items.allocatedUsers({ includedUsage: 3 });

		const updateParams = {
			customer_id: customerId,
			product_id: pro.id,
			items: [newAllocatedUsersItem, priceItem],
		};

		const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

		// Should charge $20 for 2 extra seats @ $10 each
		expect(preview.total).toBe(20);

		await autumnV1.subscriptions.update(updateParams);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// Using 5 with 3 included = -2 balance
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Users,
			includedUsage: newAllocatedUsersItem.included_usage,
			balance: newAllocatedUsersItem.included_usage - seatsUsed,
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
