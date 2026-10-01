/**
 * Deleting an allocated entity releases its share in the same request.
 *
 * Red (before):  the deleted entity's 5k stays allocated; unallocated stays 0.
 * Green (after): only B's 5k is allocated; A's unused share becomes unallocated.
 */

import { test } from "bun:test";
import { ApiVersion, ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import {
	allocateMessages,
	setupSharedPool,
	trackMessages,
	waitForSharedBalanceInDb,
	warmCaches,
} from "./utils/allocateTestUtils.js";
import { expectMessagesBalance } from "./utils/expectMessagesBalance.js";

const autumnV2_3 = new AutumnInt({ version: ApiVersion.V2_3 });

test.concurrent(
	`${chalk.yellowBright("allocate-delete1: deleting an allocated entity releases its share")}`,
	async () => {
		const customerId = "allocate-delete-1";
		const shared = products.base({
			id: `${customerId}-shared`,
			items: [items.monthlyMessages({ includedUsage: 10000 })],
		});
		const { entities, ctx } = await initScenario({
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
		await autumnV2_3.track({
			customer_id: customerId,
			entity_id: a,
			feature_id: TestFeature.Messages,
			value: 2000,
		});

		// Delete drops the cache, so let the track reach Postgres first.
		await waitForSharedBalanceInDb({ ctx, customerId, balance: 8000 });
		await autumnV2_3.entities.delete(customerId, a);

		await expectMessagesBalance({
			autumn: autumnV2_3,
			customerId,
			expected: { remaining: 8000, allocated: 5000, unallocated: 3000 },
		});
	},
);

/** A=5k, B=5k on 10k; A uses 2k, then A is deleted: 3k of A's share becomes unallocated. */
const deleteUsedShare = async ({ customerId }: { customerId: string }) => {
	const { ctx, entityIds } = await setupSharedPool({ customerId });
	const [a, b, c] = entityIds;
	await allocateMessages({
		customerId,
		allocations: [
			{ entity_id: a, amount: 5000 },
			{ entity_id: b, amount: 5000 },
		],
	});
	await warmCaches({ customerId, entityIds });
	await trackMessages({ customerId, entityId: a, value: 2000 });
	await waitForSharedBalanceInDb({ ctx, customerId, balance: 8000 });
	await autumnV2_3.entities.delete(customerId, a);
	await expectMessagesBalance({
		autumn: autumnV2_3,
		customerId,
		expected: { remaining: 8000, allocated: 5000, unallocated: 3000 },
	});
	await warmCaches({ customerId, entityIds: [b, c] });
	return { b, c };
};

test.concurrent(
	`${chalk.yellowBright("allocate-delete2: an entity without a share can use the freed credits, and no more")}`,
	async () => {
		const customerId = "allocate-delete-2";
		const { c } = await deleteUsedShare({ customerId });

		await trackMessages({ customerId, entityId: c, value: 3000 });
		await expectMessagesBalance({
			autumn: autumnV2_3,
			customerId,
			expected: { remaining: 5000, unallocated: 0 },
		});

		await trackMessages({ customerId, entityId: c, value: 1 });
		await expectMessagesBalance({
			autumn: autumnV2_3,
			customerId,
			expected: { remaining: 5000 },
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("allocate-delete3: the remaining entity draws its own share plus the freed credits")}`,
	async () => {
		const customerId = "allocate-delete-3";
		const { b } = await deleteUsedShare({ customerId });

		await trackMessages({ customerId, entityId: b, value: 8000 });
		await expectMessagesBalance({
			autumn: autumnV2_3,
			customerId,
			expected: { remaining: 0, allocated: 5000, unallocated: 0 },
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("allocate-delete4: a customer-level track takes the freed credits but not the remaining share")}`,
	async () => {
		const customerId = "allocate-delete-4";
		const { b } = await deleteUsedShare({ customerId });

		await trackMessages({ customerId, value: 4000 });
		await expectMessagesBalance({
			autumn: autumnV2_3,
			customerId,
			expected: { remaining: 5000, unallocated: 0 },
		});
		await expectMessagesBalance({
			autumn: autumnV2_3,
			customerId,
			entityId: b,
			expected: { granted: 5000, usage: 0, remaining: 5000 },
		});
	},
);
