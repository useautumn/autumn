import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("immediate-switch-reset 1: consumable same interval preserves reset_at")}`,
	async () => {
		const customerId = "reset-consumable-same-interval";

		const proMessages = items.monthlyMessages({ includedUsage: 100 });
		const pro = products.pro({
			id: "pro",
			items: [proMessages],
		});

		const premiumMessages = items.monthlyMessages({ includedUsage: 500 });
		const premium = products.premium({
			id: "premium",
			items: [premiumMessages],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: true, paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.advanceTestClock({ days: 15 }),
			],
		});

		await new Promise((r) => setTimeout(r, 4000));

		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 30,
		});

		await new Promise((r) => setTimeout(r, 2000));

		const customerBefore =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		const originalResetAt =
			customerBefore.features[TestFeature.Messages]?.next_reset_at;
		expect(originalResetAt).toBeDefined();

		expectCustomerFeatureCorrect({
			customer: customerBefore,
			featureId: TestFeature.Messages,
			includedUsage: 100,
			balance: 70,
			usage: 30,
		});

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: premium.id,
			redirect_mode: "if_required",
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectCustomerProducts({
			customer,
			active: [premium.id],
			notPresent: [pro.id],
		});

		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			includedUsage: 500,
			balance: 500,
			usage: 0,
			resetsAt: originalResetAt!,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("immediate-switch-reset 4: allocated preserves reset_at, usage carries over")}`,
	async () => {
		const customerId = "reset-allocated-carries-over";

		const proAllocated = items.allocatedUsers({ includedUsage: 5 });
		const pro = products.pro({
			id: "pro",
			items: [proAllocated],
		});

		const premiumAllocated = items.allocatedUsers({ includedUsage: 10 });
		const premium = products.premium({
			id: "premium",
			items: [premiumAllocated],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: true, paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.advanceTestClock({ days: 15 }),
			],
		});

		await new Promise((r) => setTimeout(r, 4000));

		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Users,
			value: 3,
		});

		await new Promise((r) => setTimeout(r, 2000));

		const customerBefore =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		const originalResetAt =
			customerBefore.features[TestFeature.Users]?.next_reset_at;
		expect(originalResetAt).toBeDefined();

		expectCustomerFeatureCorrect({
			customer: customerBefore,
			featureId: TestFeature.Users,
			includedUsage: 5,
			balance: 2,
			usage: 3,
		});

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: premium.id,
			redirect_mode: "if_required",
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectCustomerProducts({
			customer,
			active: [premium.id],
			notPresent: [pro.id],
		});

		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Users,
			includedUsage: 10,
			balance: 7,
			usage: 3,
			resetsAt: originalResetAt!,
		});
	},
);
