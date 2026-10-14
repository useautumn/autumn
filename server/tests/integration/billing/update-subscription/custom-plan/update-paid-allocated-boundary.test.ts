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

		const seatsUsed = 5;
		await autumnV1.track(
			{
				customer_id: customerId,
				feature_id: TestFeature.Users,
				value: seatsUsed,
			},
			{ timeout: 2000 },
		);

		const customerBefore =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(customerBefore.features[TestFeature.Users].balance).toBe(-2);

		const newAllocatedUsersItem = items.allocatedUsers({ includedUsage: 10 });

		const updateParams = {
			customer_id: customerId,
			product_id: pro.id,
			items: [newAllocatedUsersItem, priceItem],
		};

		const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

		expect(preview.total).toBe(-20);

		await autumnV1.subscriptions.update(updateParams);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Users,
			includedUsage: newAllocatedUsersItem.included_usage,
			balance: newAllocatedUsersItem.included_usage - seatsUsed,
			usage: seatsUsed,
		});

		expect(customer.features[TestFeature.Users].balance).toBeGreaterThan(0);

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

		const seatsUsed = 5;
		await autumnV1.track(
			{
				customer_id: customerId,
				feature_id: TestFeature.Users,
				value: seatsUsed,
			},
			{ timeout: 2000 },
		);

		const newAllocatedUsersItem = items.allocatedUsers({ includedUsage: 5 });

		const updateParams = {
			customer_id: customerId,
			product_id: pro.id,
			items: [newAllocatedUsersItem, priceItem],
		};

		const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

		expect(preview.total).toBe(-20);

		await autumnV1.subscriptions.update(updateParams);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Users,
			includedUsage: newAllocatedUsersItem.included_usage,
			balance: 0,
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
