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
// BOUNDARY CROSSING: USAGE GOES FROM > INCLUDED TO < INCLUDED
// ═══════════════════════════════════════════════════════════════════════════════

// Increase allowance so usage goes from overage to within included
test.concurrent(
	`${chalk.yellowBright("allocated: increase allowance, usage crosses from overage to within included")}`,
	async () => {
		const allocatedUsersItem = items.allocatedUsers({ includedUsage: 3 });
		const priceItem = items.monthlyPrice({ price: 20 });
		const pro = products.base({
			id: "pro",
			items: [allocatedUsersItem, priceItem],
		});

		const { customerId, autumnV1, ctx } = await initScenario({
			customerId: "alloc-boundary-over-to-under",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.attach({ productId: "pro" })],
		});

		// Use 5 seats (2 over the 3 included)
		// NOTE: For allocated features, tracking usage past the included boundary
		// immediately creates a prorated invoice (see adjustAllowance.ts)
		const seatsUsed = 5;
		await autumnV1.track(
			{
				customer_id: customerId,
				feature_id: TestFeature.Users,
				value: seatsUsed,
			},
			{ timeout: 2000 },
		);

		// Verify we're in overage initially
		const customerBefore =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(customerBefore.features[TestFeature.Users].balance).toBe(-2);

		// Increase to 10 included seats - now usage (5) is within included (10)
		const newAllocatedUsersItem = items.allocatedUsers({ includedUsage: 10 });

		const updateParams = {
			customer_id: customerId,
			product_id: pro.id,
			items: [newAllocatedUsersItem, priceItem],
		};

		const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

		// Was paying for 2 extra seats @ $10 = $20
		// Now paying for 0 extra seats
		// Should get credit of -$20
		expect(preview.total).toBe(-20);

		await autumnV1.subscriptions.update(updateParams);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// Now balance should be positive (10 - 5 = 5)
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Users,
			includedUsage: newAllocatedUsersItem.included_usage,
			balance: newAllocatedUsersItem.included_usage - seatsUsed, // 10 - 5 = 5
			usage: seatsUsed,
		});

		// Balance should now be positive
		expect(customer.features[TestFeature.Users].balance).toBeGreaterThan(0);

		// Invoice count: 1 (initial attach) + 1 (track overage) + 1 (update credit) = 3
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

// Increase allowance to exactly match usage (boundary case)
test.concurrent(
	`${chalk.yellowBright("allocated: increase allowance to exactly match usage")}`,
	async () => {
		const allocatedUsersItem = items.allocatedUsers({ includedUsage: 3 });
		const priceItem = items.monthlyPrice({ price: 20 });
		const pro = products.base({
			id: "pro",
			items: [allocatedUsersItem, priceItem],
		});

		const { customerId, autumnV1, ctx } = await initScenario({
			customerId: "alloc-boundary-exact",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.attach({ productId: "pro" })],
		});

		// Use 5 seats (2 over the 3 included)
		// NOTE: For allocated features, tracking usage past the included boundary
		// immediately creates a prorated invoice (see adjustAllowance.ts)
		const seatsUsed = 5;
		await autumnV1.track(
			{
				customer_id: customerId,
				feature_id: TestFeature.Users,
				value: seatsUsed,
			},
			{ timeout: 2000 },
		);

		// Increase to exactly 5 included seats - matches usage exactly
		const newAllocatedUsersItem = items.allocatedUsers({ includedUsage: 5 });

		const updateParams = {
			customer_id: customerId,
			product_id: pro.id,
			items: [newAllocatedUsersItem, priceItem],
		};

		const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

		// Was paying for 2 extra seats @ $10 = $20
		// Now paying for 0 extra seats
		// Should get credit of -$20
		expect(preview.total).toBe(-20);

		await autumnV1.subscriptions.update(updateParams);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// Balance should be exactly 0 (5 - 5 = 0)
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Users,
			includedUsage: newAllocatedUsersItem.included_usage,
			balance: 0, // 5 - 5 = 0
			usage: seatsUsed,
		});

		// Invoice count: 1 (initial attach) + 1 (track overage) + 1 (update credit) = 3
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
