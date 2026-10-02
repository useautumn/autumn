/**
 * A new cycle starts every share over: entity counters read 0 and shares cut by a shrunk pot
 * are re-fitted to the refilled pot.
 *
 * Contract:
 *   A=5k, B=5k on 10k, A uses 4k → reset → A: usage 0, remaining 5k; shared remaining 10k.
 *   Shares cut to 1.5k each on a 3k pot → reset refills to 6k → 3k each, as requested.
 *   Shares of 10k requested on a 6k pot stay cut to 3k each after a reset.
 */

import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import {
	allocateMessages,
	autumnV2_3,
	resetSharedCycle,
	setupSharedPool,
	trackMessages,
	waitForSharedBalanceInDb,
	warmCaches,
} from "./utils/allocateTestUtils.js";
import { expectMessagesBalance } from "./utils/expectMessagesBalance.js";

const expectGranted = async ({
	customerId,
	entityIds,
	granted,
}: {
	customerId: string;
	entityIds: string[];
	granted: number;
}) => {
	for (const entityId of entityIds)
		await expectMessagesBalance({
			autumn: autumnV2_3,
			customerId,
			entityId,
			expected: { granted },
		});
};

const setupBaseAndAddOn = async ({ customerId }: { customerId: string }) => {
	const base = products.base({
		id: `${customerId}-base`,
		items: [items.monthlyMessages({ includedUsage: 6000 })],
	});
	const addOn = products.base({
		id: `${customerId}-addon`,
		isAddOn: true,
		items: [items.monthlyMessages({ includedUsage: 4000 })],
	});
	const { ctx, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [base, addOn] }),
			s.entities({ count: 3, featureId: TestFeature.Users }),
		],
		actions: [s.billing.attach({ productId: base.id })],
	});
	const entityIds = entities.map((entity) => entity.id);
	await warmCaches({ customerId, entityIds });
	return { ctx, entityIds, addOnId: addOn.id };
};

const cancelAddOn = ({
	customerId,
	addOnId,
}: {
	customerId: string;
	addOnId: string;
}) =>
	autumnV2_3.subscriptions.update({
		customer_id: customerId,
		plan_id: addOnId,
		cancel_action: "cancel_immediately",
	});

test.concurrent(
	`${chalk.yellowBright("allocate-reset1: a new cycle zeroes every entity's usage")}`,
	async () => {
		const customerId = "allocate-reset-1";
		const { ctx, entityIds } = await setupSharedPool({ customerId });
		const [a, b] = entityIds;
		await allocateMessages({
			customerId,
			allocations: [
				{ entity_id: a, amount: 5000 },
				{ entity_id: b, amount: 5000 },
			],
		});
		await warmCaches({ customerId, entityIds });
		await trackMessages({ customerId, entityId: a, value: 4000 });
		await waitForSharedBalanceInDb({ ctx, customerId, remainingBalance: 6000 });

		await resetSharedCycle({ ctx, customerId });

		await expectMessagesBalance({
			autumn: autumnV2_3,
			customerId,
			entityId: a,
			expected: { granted: 5000, usage: 0, remaining: 5000 },
		});
		await expectMessagesBalance({
			autumn: autumnV2_3,
			customerId,
			expected: { remaining: 10000, allocated: 10000, unallocated: 0 },
		});

		// A's whole share is usable again.
		await warmCaches({ customerId, entityIds });
		await trackMessages({ customerId, entityId: a, value: 5000 });
		await expectMessagesBalance({
			autumn: autumnV2_3,
			customerId,
			expected: { remaining: 5000 },
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("allocate-reset2: shares cut by a shrunk pot are restored when the cycle refills it")}`,
	async () => {
		const customerId = "allocate-reset-2";
		const { ctx, entityIds, addOnId } = await setupBaseAndAddOn({
			customerId,
		});
		const [a, b, c] = entityIds;

		// A's 3k usage lands on the base row and stays after A's share is released.
		await allocateMessages({
			customerId,
			allocations: [
				{ entity_id: a, amount: 3000 },
				{ entity_id: b, amount: 3000 },
			],
		});
		await warmCaches({ customerId, entityIds });
		await trackMessages({ customerId, entityId: a, value: 3000 });
		await waitForSharedBalanceInDb({ ctx, customerId, remainingBalance: 3000 });
		await allocateMessages({
			customerId,
			allocations: [{ entity_id: a, amount: 0 }],
		});

		await autumnV2_3.billing.attach({
			customer_id: customerId,
			plan_id: addOnId,
		});
		await allocateMessages({
			customerId,
			allocations: [{ entity_id: c, amount: 3000 }],
		});

		// 6k requested on 3k left: each share is cut by half.
		await cancelAddOn({ customerId, addOnId });
		await expectGranted({ customerId, entityIds: [b, c], granted: 1500 });

		await resetSharedCycle({ ctx, customerId });
		await expectGranted({ customerId, entityIds: [b, c], granted: 3000 });
		await expectMessagesBalance({
			autumn: autumnV2_3,
			customerId,
			expected: { remaining: 6000, allocated: 6000, unallocated: 0 },
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("allocate-reset3: shares stay cut after a reset while the pot is still smaller than requested")}`,
	async () => {
		const customerId = "allocate-reset-3";
		const { ctx, entityIds, addOnId } = await setupBaseAndAddOn({
			customerId,
		});
		const [a, b] = entityIds;
		await autumnV2_3.billing.attach({
			customer_id: customerId,
			plan_id: addOnId,
		});
		await allocateMessages({
			customerId,
			allocations: [
				{ entity_id: a, amount: 5000 },
				{ entity_id: b, amount: 5000 },
			],
		});
		await cancelAddOn({ customerId, addOnId });
		await expectGranted({ customerId, entityIds: [a, b], granted: 3000 });

		await resetSharedCycle({ ctx, customerId });
		await expectGranted({ customerId, entityIds: [a, b], granted: 3000 });
		await expectMessagesBalance({
			autumn: autumnV2_3,
			customerId,
			expected: { remaining: 6000, allocated: 6000, unallocated: 0 },
		});
	},
);
