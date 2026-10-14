import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAllocatedMessages } from "./utils/allocateTestUtils.js";

import { expect, test } from "bun:test";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import chalk from "chalk";
import {
	allocateMessages,
	autumnV2_3,
	setupSharedPool,
	trackMessages,
	warmCaches,
} from "./utils/allocateTestUtils.js";
import { expectMessagesBalance } from "./utils/expectMessagesBalance.js";

const setupEvenSplit = async ({ customerId }: { customerId: string }) => {
	const { entityIds } = await setupSharedPool({ customerId });
	const [a, b] = entityIds;
	await allocateMessages({
		customerId,
		allocations: [
			{ entity_id: a, amount: 5000 },
			{ entity_id: b, amount: 5000 },
		],
	});
	await warmCaches({ customerId, entityIds });
	return { a, b, entityIds };
};

test.concurrent(
	`${chalk.yellowBright("allocate-move1: moving credits between shares in one call passes")}`,
	async () => {
		const customerId = "allocate-move-1";
		const { a, b } = await setupEvenSplit({ customerId });

		const moved = await allocateMessages({
			customerId,
			allocations: [
				{ entity_id: b, amount: 8000 },
				{ entity_id: a, amount: 2000 },
			],
		});
		await expectAllocatedMessages({
			customerId,
			response: moved,
			expected: [
				{ entity_id: b, amount: 8000, granted: 8000, remaining: 8000 },
				{ entity_id: a, amount: 2000, granted: 2000, remaining: 2000 },
			],
		});
		expect(moved.balances[TestFeature.Messages]).toMatchObject({
			granted: 10000,
			remaining: 10000,
			allocated: 10000,
			unallocated: 0,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("allocate-move2: after a move each entity draws its new share")}`,
	async () => {
		const customerId = "allocate-move-2";
		const { a, b, entityIds } = await setupEvenSplit({ customerId });
		await allocateMessages({
			customerId,
			allocations: [
				{ entity_id: b, amount: 8000 },
				{ entity_id: a, amount: 2000 },
			],
		});
		await warmCaches({ customerId, entityIds });

		await trackMessages({ customerId, entityId: b, value: 8000 });
		await expectMessagesBalance({
			autumn: autumnV2_3,
			customerId,
			expected: { remaining: 2000 },
		});

		await trackMessages({ customerId, entityId: a, value: 3000 });
		await expectMessagesBalance({
			autumn: autumnV2_3,
			customerId,
			expected: { remaining: 0 },
		});
		await expectMessagesBalance({
			autumn: autumnV2_3,
			customerId,
			entityId: a,
			expected: { granted: 2000, usage: 2000, remaining: 0 },
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("allocate-move3: a batch that adds credits overall is rejected and changes nothing")}`,
	async () => {
		const customerId = "allocate-move-3";
		const { a, b } = await setupEvenSplit({ customerId });

		await expectAutumnError({
			errCode: "allocation_exceeds_available",
			func: () =>
				allocateMessages({
					customerId,
					allocations: [
						{ entity_id: b, amount: 9000 },
						{ entity_id: a, amount: 2000 },
					],
				}),
		});

		for (const entityId of [a, b])
			await expectMessagesBalance({
				autumn: autumnV2_3,
				customerId,
				entityId,
				expected: { granted: 5000 },
			});
		await expectMessagesBalance({
			autumn: autumnV2_3,
			customerId,
			expected: { allocated: 10000, unallocated: 0 },
		});
	},
);
