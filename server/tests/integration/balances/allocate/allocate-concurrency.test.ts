/**
 * Concurrent allocate calls are checked one after another under the customer lock, so two
 * calls that each fit alone but not together can't both pass the over-allocation check.
 *
 * Contract (10k pot): Promise.all of two over-allocating calls → exactly one succeeds, the
 *   other fails with allocation_exceeds_available; calls that fit together both succeed.
 */

import { expect, test } from "bun:test";
import chalk from "chalk";
import type AutumnError from "@/external/autumn/autumnCli.js";
import {
	allocateMessages,
	autumnV2_3,
	setupSharedPool,
} from "./utils/allocateTestUtils.js";
import { expectMessagesBalance } from "./utils/expectMessagesBalance.js";

const allocateConcurrently = async ({
	customerId,
	shares,
}: {
	customerId: string;
	shares: { entityId: string; amount: number }[];
}) => {
	const results = await Promise.allSettled(
		shares.map(({ entityId, amount }) =>
			allocateMessages({
				customerId,
				allocations: [{ entity_id: entityId, amount }],
			}),
		),
	);
	return {
		succeeded: results.filter((result) => result.status === "fulfilled"),
		failed: results.flatMap((result) =>
			result.status === "rejected" ? [result.reason as AutumnError] : [],
		),
	};
};

const expectExactlyOneSucceeded = ({
	succeeded,
	failed,
}: Awaited<ReturnType<typeof allocateConcurrently>>) => {
	expect(succeeded).toHaveLength(1);
	expect(failed).toHaveLength(1);
	expect(failed[0].code).toBe("allocation_exceeds_available");
};

test.concurrent(
	`${chalk.yellowBright("allocate-concurrent1: two concurrent first calls can't both over-allocate")}`,
	async () => {
		const customerId = "allocate-concurrent-1";
		const { entityIds } = await setupSharedPool({ customerId });
		const [a, b] = entityIds;

		expectExactlyOneSucceeded(
			await allocateConcurrently({
				customerId,
				shares: [
					{ entityId: a, amount: 6000 },
					{ entityId: b, amount: 6000 },
				],
			}),
		);
		await expectMessagesBalance({
			autumn: autumnV2_3,
			customerId,
			expected: { remaining: 10000, allocated: 6000, unallocated: 4000 },
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("allocate-concurrent2: two concurrent calls on top of existing shares can't both over-allocate")}`,
	async () => {
		const customerId = "allocate-concurrent-2";
		const { entityIds } = await setupSharedPool({ customerId });
		const [a, b, c] = entityIds;
		await allocateMessages({
			customerId,
			allocations: [{ entity_id: a, amount: 2000 }],
		});

		expectExactlyOneSucceeded(
			await allocateConcurrently({
				customerId,
				shares: [
					{ entityId: b, amount: 5000 },
					{ entityId: c, amount: 5000 },
				],
			}),
		);
		await expectMessagesBalance({
			autumn: autumnV2_3,
			customerId,
			expected: { allocated: 7000, unallocated: 3000 },
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("allocate-concurrent3: concurrent calls that fit together both succeed")}`,
	async () => {
		const customerId = "allocate-concurrent-3";
		const { entityIds } = await setupSharedPool({ customerId });
		const [a, b] = entityIds;

		const { succeeded, failed } = await allocateConcurrently({
			customerId,
			shares: [
				{ entityId: a, amount: 4000 },
				{ entityId: b, amount: 4000 },
			],
		});
		expect(failed).toEqual([]);
		expect(succeeded).toHaveLength(2);
		await expectMessagesBalance({
			autumn: autumnV2_3,
			customerId,
			expected: { allocated: 8000, unallocated: 2000 },
		});
	},
);
