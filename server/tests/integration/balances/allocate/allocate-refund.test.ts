/**
 * A refund (negative track) gives credits back to the entity's own share (PRD §8.3 step 5).
 *
 * Red (before):  A's counter keeps its usage, so the refund lands in unallocated.
 * Green (after): A's share shows the refund; unallocated is unchanged.
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
	`${chalk.yellowBright("allocate-refund1: a refund returns to the entity's own share")}`,
	async () => {
		const customerId = "allocate-refund-1";
		const shared = products.base({
			id: `${customerId}-shared`,
			items: [items.monthlyMessages({ includedUsage: 10000 })],
		});
		const { entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [shared] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [s.billing.attach({ productId: shared.id })],
		});
		const [a, b] = entities.map((entity) => entity.id);

		await autumnV2_3.balances.allocate({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			interval: ResetInterval.Month,
			allocations: [
				{ entity_id: a, amount: 5000 },
				{ entity_id: b, amount: 5000 },
			],
		});
		await autumnV2_3.customers.get(customerId);
		for (const entityId of [a, b])
			await autumnV2_3.entities.get(customerId, entityId);

		const trackA = (value: number) =>
			autumnV2_3.track({
				customer_id: customerId,
				entity_id: a,
				feature_id: TestFeature.Messages,
				value,
			});
		await trackA(4000);
		await trackA(-2000);

		await expectMessagesBalance({
			autumn: autumnV2_3,
			customerId,
			entityId: a,
			expected: { granted: 5000, usage: 2000, remaining: 3000 },
		});
		await expectMessagesBalance({
			autumn: autumnV2_3,
			customerId,
			expected: { remaining: 8000, unallocated: 0 },
		});
	},
);
