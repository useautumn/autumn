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
	`${chalk.yellowBright("immediate-switch-reset 2: prepaid usage resets, reset_at preserved")}`,
	async () => {
		const customerId = "reset-prepaid-usage-resets";

		const proPrepaid = items.prepaidMessages({
			includedUsage: 0,
			billingUnits: 100,
			price: 10,
		});
		const pro = products.pro({
			id: "pro",
			items: [proPrepaid],
		});

		const premiumPrepaid = items.prepaidMessages({
			includedUsage: 0,
			billingUnits: 100,
			price: 10,
		});
		const premium = products.premium({
			id: "premium",
			items: [premiumPrepaid],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: true, paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [
				s.billing.attach({
					productId: pro.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
				}),
				s.advanceTestClock({ days: 15 }),
			],
		});

		await new Promise((r) => setTimeout(r, 4000));

		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 50,
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
			balance: 150,
			usage: 50,
		});

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: premium.id,
			options: [{ feature_id: TestFeature.Messages, quantity: 300 }],
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
			balance: 300,
			usage: 0,
			resetsAt: originalResetAt!,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("immediate-switch-reset 3: prepaid resets, allocated carries over")}`,
	async () => {
		const customerId = "reset-prepaid-vs-allocated";

		const proPrepaidMessages = items.prepaidMessages({
			includedUsage: 0,
			billingUnits: 100,
			price: 10,
		});
		const proAllocatedUsers = items.allocatedUsers({ includedUsage: 5 });
		const pro = products.pro({
			id: "pro",
			items: [proPrepaidMessages, proAllocatedUsers],
		});

		const premiumPrepaidMessages = items.prepaidMessages({
			includedUsage: 0,
			billingUnits: 100,
			price: 10,
		});
		const premiumAllocatedUsers = items.allocatedUsers({ includedUsage: 10 });
		const premium = products.premium({
			id: "premium",
			items: [premiumPrepaidMessages, premiumAllocatedUsers],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: true, paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [
				s.billing.attach({
					productId: pro.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
				}),
			],
		});

		await new Promise((r) => setTimeout(r, 2000));

		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 50,
		});
		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Users,
			value: 3,
		});

		await new Promise((r) => setTimeout(r, 2000));

		const customerBefore =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expectCustomerFeatureCorrect({
			customer: customerBefore,
			featureId: TestFeature.Messages,
			balance: 150,
			usage: 50,
		});
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
			options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
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
			balance: 200,
			usage: 0,
		});

		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Users,
			includedUsage: 10,
			balance: 7,
			usage: 3,
		});
	},
);
