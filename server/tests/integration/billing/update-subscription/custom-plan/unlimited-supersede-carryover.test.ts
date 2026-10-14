import { expect, test } from "bun:test";
import type { ApiEntityV2 } from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const ACTION1_EVENTS = 500;
const CREDITS_CONSUMED = 100;
const NEW_ALLOWANCE = 50;

test.concurrent(
	`${chalk.yellowBright("supersede: finite customize wins over a surviving unlimited credit grant")}`,
	async () => {
		const customerId = "unlim-credits-supersede";
		const plan = products.pro({
			id: "unlim-credits-supersede-pro",
			items: [items.unlimited({ featureId: TestFeature.Credits })],
		});

		const { autumnV1, autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [plan] }),
			],
			actions: [
				s.billing.attach({ productId: plan.id }),
				s.track({
					featureId: TestFeature.Action1,
					value: ACTION1_EVENTS,
					timeout: 8000,
				}),
			],
		});

		await expectBalanceCorrect({
			customerId,
			autumn: autumnV2_3,
			featureId: TestFeature.Credits,
			skipCache: true,
			usage: CREDITS_CONSUMED,
		});

		await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: plan.id,
			items: [
				items.unlimited({ featureId: TestFeature.Credits }),
				items.monthlyCredits({ includedUsage: NEW_ALLOWANCE }),
			],
		});

		await expectBalanceCorrect({
			customerId,
			autumn: autumnV2_3,
			featureId: TestFeature.Credits,
			skipCache: true,
			granted: NEW_ALLOWANCE,
			usage: CREDITS_CONSUMED,
			remaining: 0,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("supersede: replacing the unlimited grant outright still carries usage")}`,
	async () => {
		const customerId = "unlim-credits-replaced";
		const plan = products.pro({
			id: "unlim-credits-replaced-pro",
			items: [items.unlimited({ featureId: TestFeature.Credits })],
		});

		const { autumnV1, autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [plan] }),
			],
			actions: [
				s.billing.attach({ productId: plan.id }),
				s.track({
					featureId: TestFeature.Action1,
					value: ACTION1_EVENTS,
					timeout: 8000,
				}),
			],
		});

		await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: plan.id,
			items: [items.monthlyCredits({ includedUsage: NEW_ALLOWANCE })],
		});

		await expectBalanceCorrect({
			customerId,
			autumn: autumnV2_3,
			featureId: TestFeature.Credits,
			skipCache: true,
			granted: NEW_ALLOWANCE,
			usage: CREDITS_CONSUMED,
			remaining: 0,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("supersede: a per-entity unlimited grant survives a global finite grant")}`,
	async () => {
		const customerId = "unlim-scope-preserved";
		const plan = products.pro({
			id: "unlim-scope-preserved-pro",
			items: [
				items.unlimited({
					featureId: TestFeature.Messages,
					entityFeatureId: TestFeature.Users,
				}),
			],
		});

		const { autumnV1, autumnV2_3, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [plan] }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
			],
			actions: [s.attach({ productId: plan.id })],
		});

		await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: plan.id,
			items: [
				items.unlimited({
					featureId: TestFeature.Messages,
					entityFeatureId: TestFeature.Users,
				}),
				items.monthlyMessages({ includedUsage: NEW_ALLOWANCE }),
			],
		});

		const entity = await autumnV2_3.entities.get<ApiEntityV2>(
			customerId,
			entities[0].id,
			{ skip_cache: "true" },
		);
		expect(entity.balances[TestFeature.Messages]?.unlimited).toBe(true);
	},
);
