/**
 * When shared credits shrink below what's been allocated, every share is cut by the same
 * proportion; when they grow back, shares return to the requested amounts.
 *
 * Red (before):  shares stay at 5k after the add-on goes, promising credits that don't exist.
 * Green (after): 6k left for 10k promised → each share 3k; re-adding the add-on → 5k again.
 */

import { test } from "bun:test";
import { ApiVersion, ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { expectMessagesBalance } from "./utils/expectMessagesBalance.js";

const autumnV2_3 = new AutumnInt({ version: ApiVersion.V2_3 });

test.concurrent(
	`${chalk.yellowBright("allocate-pot1: shares shrink proportionally with the pot and recover when it grows back")}`,
	async () => {
		const customerId = "allocate-pot-1";
		const base = products.base({
			id: `${customerId}-base`,
			items: [items.monthlyMessages({ includedUsage: 6000 })],
		});
		const addOn = products.base({
			id: `${customerId}-addon`,
			isAddOn: true,
			items: [items.monthlyMessages({ includedUsage: 4000 })],
		});
		const { entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [base, addOn] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({ productId: base.id }),
				s.billing.attach({ productId: addOn.id }),
			],
		});
		const [a, b] = entities.map((entity) => entity.id);

		await autumnV2_3.customers.update(customerId, {
			billing_controls: {
				balance_allocations: [
					{
						feature_id: TestFeature.Messages,
						interval: ResetInterval.Month,
						allocations: [
							{ entity_id: a, amount: 5000 },
							{ entity_id: b, amount: 5000 },
						],
					},
				],
			},
		});

		await autumnV2_3.subscriptions.update({
			customer_id: customerId,
			plan_id: addOn.id,
			cancel_action: "cancel_immediately",
		});
		for (const entityId of [a, b])
			await expectMessagesBalance({
				autumn: autumnV2_3,
				customerId,
				entityId,
				expected: { granted: 3000 },
			});
		await expectMessagesBalance({
			autumn: autumnV2_3,
			customerId,
			expected: { remaining: 6000, allocated: 6000, unallocated: 0 },
		});

		await autumnV2_3.billing.attach({
			customer_id: customerId,
			plan_id: addOn.id,
		});
		for (const entityId of [a, b])
			await expectMessagesBalance({
				autumn: autumnV2_3,
				customerId,
				entityId,
				expected: { granted: 5000 },
			});
	},
);
