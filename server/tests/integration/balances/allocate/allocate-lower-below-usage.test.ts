/**
 * Lowering a share below what the entity already used is allowed: usage stays, the share is
 * spent, and only the part of the old share the entity didn't use becomes unallocated.
 *
 * Contract: A=5k, B=5k on 10k; A uses 4k; A→1k.
 *   A: granted 1k, usage 4k, remaining 0. Shared: remaining 6k, allocated 6k, unallocated 1k.
 *   A may then draw only unallocated credits; B's share is untouched.
 */

import { expect, test } from "bun:test";
import chalk from "chalk";
import {
	allocateMessages,
	autumnV2_3,
	isMessagesAllowed,
	setupSharedPool,
	trackMessages,
	warmCaches,
} from "./utils/allocateTestUtils.js";
import { expectMessagesBalance } from "./utils/expectMessagesBalance.js";

const lowerBelowUsage = async ({ customerId }: { customerId: string }) => {
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
	await trackMessages({ customerId, entityId: a, value: 4000 });
	await expectMessagesBalance({
		autumn: autumnV2_3,
		customerId,
		expected: { remaining: 6000 },
	});

	const lowered = await allocateMessages({
		customerId,
		allocations: [{ entity_id: a, amount: 1000 }],
	});
	await warmCaches({ customerId, entityIds });
	return { a, b, lowered };
};

test.concurrent(
	`${chalk.yellowBright("allocate-lower1: lowering a share below usage keeps the usage and frees only the unused part")}`,
	async () => {
		const customerId = "allocate-lower-1";
		const { a, lowered } = await lowerBelowUsage({ customerId });

		expect(lowered.allocations).toMatchObject([
			{ entity_id: a, amount: 1000, granted: 1000, usage: 4000, remaining: 0 },
		]);
		expect(lowered.shared).toEqual({
			granted: 10000,
			remaining: 6000,
			allocated: 6000,
			unallocated: 1000,
		});
		await expectMessagesBalance({
			autumn: autumnV2_3,
			customerId,
			entityId: a,
			expected: { granted: 1000, usage: 4000, remaining: 0 },
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("allocate-lower2: after lowering, the entity draws only unallocated credits")}`,
	async () => {
		const customerId = "allocate-lower-2";
		const { a } = await lowerBelowUsage({ customerId });

		expect(
			await isMessagesAllowed({
				customerId,
				entityId: a,
				requiredBalance: 1000,
			}),
		).toBe(true);
		expect(
			await isMessagesAllowed({
				customerId,
				entityId: a,
				requiredBalance: 1001,
			}),
		).toBe(false);

		await trackMessages({ customerId, entityId: a, value: 2000 });
		await expectMessagesBalance({
			autumn: autumnV2_3,
			customerId,
			expected: { remaining: 5000, unallocated: 0 },
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("allocate-lower3: lowering one share leaves the other share whole")}`,
	async () => {
		const customerId = "allocate-lower-3";
		const { b } = await lowerBelowUsage({ customerId });

		expect(
			await isMessagesAllowed({
				customerId,
				entityId: b,
				requiredBalance: 6000,
			}),
		).toBe(true);
		expect(
			await isMessagesAllowed({
				customerId,
				entityId: b,
				requiredBalance: 6001,
			}),
		).toBe(false);

		await trackMessages({ customerId, entityId: b, value: 6000 });
		await expectMessagesBalance({
			autumn: autumnV2_3,
			customerId,
			expected: { remaining: 0, unallocated: 0 },
		});
	},
);
