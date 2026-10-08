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

// Update when already in overage, increase allowance but still in overage
test.concurrent(
	`${chalk.yellowBright("allocated: increase allowance, still in overage")}`,
	async () => {
		const allocatedUsersItem = items.allocatedUsers({ includedUsage: 2 });
		const priceItem = items.monthlyPrice({ price: 20 });
		const pro = products.base({
			id: "pro",
			items: [allocatedUsersItem, priceItem],
		});

		const { customerId, autumnV1, ctx } = await initScenario({
			customerId: "alloc-inc-still-over",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.attach({ productId: "pro" })],
		});

		// Use 10 seats (8 over the 2 included)
		// NOTE: For allocated features, tracking usage past the included boundary
		// immediately creates a prorated invoice (see adjustAllowance.ts)
		const seatsUsed = 10;
		await autumnV1.track(
			{
				customer_id: customerId,
				feature_id: TestFeature.Users,
				value: seatsUsed,
			},
			{ timeout: 2000 },
		);

		// Increase to 5 included (still 5 over)
		const newAllocatedUsersItem = items.allocatedUsers({ includedUsage: 5 });

		const updateParams = {
			customer_id: customerId,
			product_id: pro.id,
			items: [newAllocatedUsersItem, priceItem],
		};

		const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

		// Was paying for 8 extra seats, now paying for 5 extra seats
		// Credit for 3 seats @ $10 = -$30
		expect(preview.total).toBe(-30);

		await autumnV1.subscriptions.update(updateParams);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Users,
			includedUsage: newAllocatedUsersItem.included_usage,
			balance: newAllocatedUsersItem.included_usage - seatsUsed, // 5 - 10 = -5
			usage: seatsUsed,
		});

		// Invoice count: 1 (initial attach) + 1 (track overage) + 1 (update) = 3
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

// Decrease allowance so usage goes from within included to overage
test.concurrent(
	`${chalk.yellowBright("allocated: decrease allowance, usage crosses from within to overage")}`,
	async () => {
		const allocatedUsersItem = items.allocatedUsers({ includedUsage: 10 });
		const priceItem = items.monthlyPrice({ price: 20 });
		const pro = products.base({
			id: "pro",
			items: [allocatedUsersItem, priceItem],
		});

		const { customerId, autumnV1, ctx } = await initScenario({
			customerId: "alloc-boundary-under-to-over",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.attach({ productId: "pro" })],
		});

		// Use 5 seats (within the 10 included)
		const seatsUsed = 5;
		await autumnV1.track(
			{
				customer_id: customerId,
				feature_id: TestFeature.Users,
				value: seatsUsed,
			},
			{ timeout: 2000 },
		);

		// Verify we're within included initially
		const customerBefore =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(customerBefore.features[TestFeature.Users].balance).toBe(5); // 10 - 5 = 5

		// Decrease to 3 included seats - now usage (5) exceeds included (3)
		const newAllocatedUsersItem = items.allocatedUsers({ includedUsage: 3 });

		const updateParams = {
			customer_id: customerId,
			product_id: pro.id,
			items: [newAllocatedUsersItem, priceItem],
		};

		const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

		// Was paying for 0 extra seats
		// Now paying for 2 extra seats @ $10 = $20
		expect(preview.total).toBe(20);

		await autumnV1.subscriptions.update(updateParams);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// Now balance should be negative (3 - 5 = -2)
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Users,
			includedUsage: newAllocatedUsersItem.included_usage,
			balance: newAllocatedUsersItem.included_usage - seatsUsed, // 3 - 5 = -2
			usage: seatsUsed,
		});

		// Balance should now be negative
		expect(customer.features[TestFeature.Users].balance).toBeLessThan(0);

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
