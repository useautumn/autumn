/**
 * A routed customer's balances.update lands on the worker at Kafka ack; the allocation refit after it
 * reads Postgres, so the worker must land the update first or the shares are solved from the old pot.
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
	`${chalk.yellowBright("allocate-update-refit: shares re-fit to the pot balances.update just set")}`,
	async () => {
		const customerId = "allocate-update-refit";
		const base = products.base({
			id: customerId,
			items: [items.monthlyMessages({ includedUsage: 10000 })],
		});
		const { entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [base] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [s.billing.attach({ productId: base.id })],
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

		await autumnV2_3.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			remaining: 6000,
		});

		for (const entityId of [a, b])
			await expectMessagesBalance({
				autumn: autumnV2_3,
				customerId,
				entityId,
				expected: { granted: 3000 },
			});
	},
);
