import { test } from "bun:test";
import { ProductItemInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const unlimitedPooledMessages = () => ({
	...items.unlimitedMessages(),
	interval: ProductItemInterval.Month,
	pooled: true,
});

test(
	chalk.yellowBright(
		"scenario: free unlimited pool shared across two entities",
	),
	async () => {
		const plan = products.base({
			id: "unlimited-pool-free-plan",
			items: [unlimitedPooledMessages()],
		});

		await initScenario({
			customerId: "unlimited-pool-free",
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
				s.products({ list: [plan] }),
			],
			actions: [
				s.billing.attach({ productId: plan.id, entityIndex: 0 }),
				s.billing.attach({ productId: plan.id, entityIndex: 1 }),
				s.track({
					featureId: TestFeature.Messages,
					value: 1_000_000,
					timeout: 2_000,
				}),
			],
		});
	},
);

test(chalk.yellowBright("scenario: paid monthly unlimited pool"), async () => {
	const plan = products.pro({
		id: "unlimited-pool-paid-plan",
		items: [unlimitedPooledMessages()],
	});

	await initScenario({
		customerId: "unlimited-pool-paid",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
			s.products({ list: [plan] }),
		],
		actions: [
			s.billing.attach({ productId: plan.id, entityIndex: 0 }),
			s.track({
				featureId: TestFeature.Messages,
				value: 1_000_000,
				timeout: 2_000,
			}),
		],
	});
});

test(
	chalk.yellowBright("scenario: finite and unlimited pools coexist"),
	async () => {
		const finitePlan = products.base({
			id: "mixed-pool-finite-plan",
			items: [
				{
					...items.monthlyMessages({ includedUsage: 100 }),
					pooled: true,
				},
			],
		});
		const unlimitedPlan = products.base({
			id: "mixed-pool-unlimited-plan",
			isAddOn: true,
			items: [unlimitedPooledMessages()],
		});

		await initScenario({
			customerId: "unlimited-pool-mixed",
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
				s.products({ list: [finitePlan, unlimitedPlan] }),
			],
			actions: [
				s.billing.attach({ productId: finitePlan.id, entityIndex: 0 }),
				s.billing.attach({ productId: unlimitedPlan.id, entityIndex: 1 }),
				s.track({
					featureId: TestFeature.Messages,
					value: 1_000_000,
					timeout: 2_000,
				}),
			],
		});
	},
);
