import { test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import {
	cleanupOrgRollout,
	setOrgRolloutPercent,
} from "@tests/utils/rolloutTestUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { setCustomerSpendLimit } from "../../balances/utils/spend-limit-utils/customerSpendLimitUtils.js";

const testCase = "rollout-track-overflow";

// overage_behavior "overflow" on the LEGACY (pre-fullSubject) deduction path:
// balance goes negative, and a customer spend limit still clamps.
test(
	`${chalk.yellowBright(`${testCase}: overflow works on the v1 rollout path`)}`,
	async () => {
		const monthlyMessages = items.monthlyMessages({ includedUsage: 100 });
		const freeProd = products.base({
			id: "free",
			items: [monthlyMessages],
		});

		const customerId = `${testCase}`;

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freeProd] }),
			],
			actions: [s.attach({ productId: freeProd.id })],
		});

		const orgId = ctx.org.id;

		try {
			await setOrgRolloutPercent({ orgId, percent: 0 });

			await autumnV2_2.track({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: 150,
				overage_behavior: "overflow",
			});
			await timeout(2000);

			const afterOverflow =
				await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
			expectBalanceCorrect({
				customer: afterOverflow,
				featureId: TestFeature.Messages,
				remaining: 0,
				usage: 150,
			});

			// Cap mode on the legacy path still floors at the negative balance.
			await autumnV2_2.track({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: 10,
			});
			await timeout(2000);

			const afterCap =
				await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
			expectBalanceCorrect({
				customer: afterCap,
				featureId: TestFeature.Messages,
				remaining: 0,
				usage: 150,
			});
		} finally {
			await cleanupOrgRollout({ orgId });
		}
	},
	{ timeout: 120_000 },
);

test(
	`${chalk.yellowBright(`${testCase}-2: spend limit still clamps overflow on the v1 rollout path`)}`,
	async () => {
		const customerProduct = products.base({
			id: "overflow-legacy-spend-limit",
			items: [
				items.lifetimeMessages({ includedUsage: 1000 }),
				items.consumableMessages({
					includedUsage: 100,
					maxPurchase: 300,
					price: 0.5,
				}),
			],
		});

		const customerId = `${testCase}-2`;

		const { autumnV2_1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [customerProduct] }),
			],
			actions: [s.billing.attach({ productId: customerProduct.id })],
		});

		const orgId = ctx.org.id;

		await setCustomerSpendLimit({
			autumn: autumnV2_1,
			customerId,
			featureId: TestFeature.Messages,
			overageLimit: 25,
		});

		try {
			await setOrgRolloutPercent({ orgId, percent: 0 });

			// 1100 granted + 20 overage consumed: 5 units of headroom left.
			await autumnV2_1.track(
				{
					customer_id: customerId,
					feature_id: TestFeature.Messages,
					value: 1120,
				},
				{ timeout: 2000 },
			);

			await autumnV2_1.track(
				{
					customer_id: customerId,
					feature_id: TestFeature.Messages,
					value: 10,
					overage_behavior: "overflow",
				},
				{ timeout: 2000 },
			);

			const customer =
				await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
			expectBalanceCorrect({
				customer,
				featureId: TestFeature.Messages,
				remaining: 0,
				usage: 1125,
			});
		} finally {
			await cleanupOrgRollout({ orgId });
		}
	},
	{ timeout: 120_000 },
);
