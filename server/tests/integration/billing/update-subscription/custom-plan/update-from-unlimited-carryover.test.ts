/**
 * Editing a plan's unlimited consumable grant down to a finite allowance must
 * carry the usage recorded while unlimited onto the new finite balance.
 *
 * Red (before the fix): the finite balance starts at the full allowance and
 *   the unlimited-era usage is wiped.
 * Green (after):        usage = tracked, remaining = allowance - tracked.
 *   Usage above the allowance lands as a negative balance, no clamping.
 */

import { test } from "bun:test";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const MESSAGES_ALLOWANCE = 100;

test.concurrent(
	`${chalk.yellowBright("p2p: unlimited -> finite carries usage within the new allowance")}`,
	async () => {
		const customerId = "unlim-to-finite-within";
		const plan = products.pro({
			id: "unlim-to-finite-within-pro",
			items: [items.unlimitedMessages()],
		});
		const tracked = 40;

		const { autumnV1, autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [plan] }),
			],
			actions: [
				s.billing.attach({ productId: plan.id }),
				s.track({
					featureId: TestFeature.Messages,
					value: tracked,
					timeout: 5000,
				}),
			],
		});

		await expectBalanceCorrect({
			customerId,
			autumn: autumnV2_3,
			featureId: TestFeature.Messages,
			usage: tracked,
		});

		await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: plan.id,
			items: [items.monthlyMessages({ includedUsage: MESSAGES_ALLOWANCE })],
		});

		await expectBalanceCorrect({
			customerId,
			autumn: autumnV2_3,
			featureId: TestFeature.Messages,
			granted: MESSAGES_ALLOWANCE,
			usage: tracked,
			remaining: MESSAGES_ALLOWANCE - tracked,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("p2p: unlimited -> finite carries usage exceeding the new allowance")}`,
	async () => {
		const customerId = "unlim-to-finite-exceed";
		const plan = products.pro({
			id: "unlim-to-finite-exceed-pro",
			items: [items.unlimitedMessages()],
		});
		const tracked = 150;

		const { autumnV1, autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [plan] }),
			],
			actions: [
				s.billing.attach({ productId: plan.id }),
				s.track({
					featureId: TestFeature.Messages,
					value: tracked,
					timeout: 5000,
				}),
			],
		});

		await expectBalanceCorrect({
			customerId,
			autumn: autumnV2_3,
			featureId: TestFeature.Messages,
			usage: tracked,
		});

		await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: plan.id,
			items: [items.monthlyMessages({ includedUsage: MESSAGES_ALLOWANCE })],
		});

		await expectBalanceCorrect({
			customerId,
			autumn: autumnV2_3,
			featureId: TestFeature.Messages,
			granted: MESSAGES_ALLOWANCE,
			usage: tracked,
			remaining: 0,
		});
	},
);
