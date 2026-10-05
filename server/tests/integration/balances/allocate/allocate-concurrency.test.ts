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
	replacements,
}: {
	customerId: string;
	replacements: { entity_id: string; amount: number }[][];
}) => {
	const results = await Promise.allSettled(
		replacements.map((allocations) =>
			allocateMessages({
				customerId,
				allocations,
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
	`${chalk.yellowBright("allocate-concurrent1: concurrent valid and over-allocated replacements isolate rejection")}`,
	async () => {
		const customerId = "allocate-concurrent-1";
		const { entityIds } = await setupSharedPool({ customerId });
		const [a, b] = entityIds;

		expectExactlyOneSucceeded(
			await allocateConcurrently({
				customerId,
				replacements: [
					[{ entity_id: a, amount: 6000 }],
					[
						{ entity_id: a, amount: 6000 },
						{ entity_id: b, amount: 6000 },
					],
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
	`${chalk.yellowBright("allocate-concurrent2: concurrent replacements preserve the successful full configuration")}`,
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
				replacements: [
					[
						{ entity_id: a, amount: 2000 },
						{ entity_id: b, amount: 5000 },
					],
					[
						{ entity_id: a, amount: 2000 },
						{ entity_id: b, amount: 5000 },
						{ entity_id: c, amount: 5000 },
					],
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
	`${chalk.yellowBright("allocate-concurrent3: concurrent valid replacements both succeed without merging")}`,
	async () => {
		const customerId = "allocate-concurrent-3";
		const { entityIds } = await setupSharedPool({ customerId });
		const [a, b] = entityIds;

		const { succeeded, failed } = await allocateConcurrently({
			customerId,
			replacements: [
				[{ entity_id: a, amount: 4000 }],
				[{ entity_id: b, amount: 4000 }],
			],
		});
		expect(failed).toEqual([]);
		expect(succeeded).toHaveLength(2);
		await expectMessagesBalance({
			autumn: autumnV2_3,
			customerId,
			expected: { allocated: 4000, unallocated: 6000 },
		});
	},
);
