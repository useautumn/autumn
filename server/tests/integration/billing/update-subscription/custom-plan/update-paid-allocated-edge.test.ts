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
// EDGE CASES
// ═══════════════════════════════════════════════════════════════════════════════

// Zero usage, increase allowance
test.concurrent(
	`${chalk.yellowBright("allocated: zero usage, increase allowance")}`,
	async () => {
		const allocatedUsersItem = items.allocatedUsers({ includedUsage: 2 });
		const priceItem = items.monthlyPrice({ price: 20 });
		const pro = products.base({
			id: "pro",
			items: [allocatedUsersItem, priceItem],
		});

		const { customerId, autumnV1, ctx } = await initScenario({
			customerId: "alloc-zero-inc",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.attach({ productId: "pro" })],
		});

		// No usage tracked - 0 seats used

		const newAllocatedUsersItem = items.allocatedUsers({ includedUsage: 10 });

		const updateParams = {
			customer_id: customerId,
			product_id: pro.id,
			items: [newAllocatedUsersItem, priceItem],
		};

		const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

		// No price change
		expect(preview.total).toBe(0);

		await autumnV1.subscriptions.update(updateParams);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Users,
			includedUsage: newAllocatedUsersItem.included_usage,
			balance: newAllocatedUsersItem.included_usage, // 10 - 0 = 10
			usage: 0,
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

// No included seats (all paid), increase to some included
test.concurrent(
	`${chalk.yellowBright("allocated: no included to some included")}`,
	async () => {
		const allocatedUsersItem = items.allocatedUsers({ includedUsage: 0 });
		const priceItem = items.monthlyPrice({ price: 20 });
		const pro = products.base({
			id: "pro",
			items: [allocatedUsersItem, priceItem],
		});

		const { customerId, autumnV1, ctx } = await initScenario({
			customerId: "alloc-none-to-some",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.attach({ productId: "pro" })],
		});

		// Use 5 seats (all paid since 0 included)
		const seatsUsed = 5;
		await autumnV1.track(
			{
				customer_id: customerId,
				feature_id: TestFeature.Users,
				value: seatsUsed,
			},
			{ timeout: 2000 },
		);

		// Increase to 3 included seats (still 2 paid)
		const newAllocatedUsersItem = items.allocatedUsers({ includedUsage: 3 });

		const updateParams = {
			customer_id: customerId,
			product_id: pro.id,
			items: [newAllocatedUsersItem, priceItem],
		};

		const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

		// Was paying for 5 seats @ $10 = $50
		// Now paying for 2 seats @ $10 = $20
		// Credit of -$30
		expect(preview.total).toBe(-30);

		await autumnV1.subscriptions.update(updateParams);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Users,
			includedUsage: newAllocatedUsersItem.included_usage,
			balance: newAllocatedUsersItem.included_usage - seatsUsed, // 3 - 5 = -2
			usage: seatsUsed,
		});

		await expectCustomerInvoiceCorrect({
			customer,
			count: 3,
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
