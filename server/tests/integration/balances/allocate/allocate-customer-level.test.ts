/**
 * Customer-level check and track (no entity) may use only unallocated credits, never a share.
 *
 * Contract: A=6k, B=2k on 10k → 2k unallocated.
 *   check without entity: 2000 allowed, 2001 not. track without entity draws at most 2k.
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

const setupPartialAllocation = async ({
	customerId,
}: {
	customerId: string;
}) => {
	const { entityIds } = await setupSharedPool({ customerId });
	const [a, b] = entityIds;
	await allocateMessages({
		customerId,
		allocations: [
			{ entity_id: a, amount: 6000 },
			{ entity_id: b, amount: 2000 },
		],
	});
	await warmCaches({ customerId, entityIds });
	return { a, b };
};

test.concurrent(
	`${chalk.yellowBright("allocate-customer1: a customer-level check counts only unallocated credits")}`,
	async () => {
		const customerId = "allocate-customer-1";
		await setupPartialAllocation({ customerId });

		expect(await isMessagesAllowed({ customerId, requiredBalance: 2000 })).toBe(
			true,
		);
		expect(await isMessagesAllowed({ customerId, requiredBalance: 2001 })).toBe(
			false,
		);
	},
);

test.concurrent(
	`${chalk.yellowBright("allocate-customer2: a customer-level track draws only unallocated credits")}`,
	async () => {
		const customerId = "allocate-customer-2";
		await setupPartialAllocation({ customerId });

		await trackMessages({ customerId, value: 3000 });
		await expectMessagesBalance({
			autumn: autumnV2_3,
			customerId,
			expected: { remaining: 8000, allocated: 8000, unallocated: 0 },
		});
		expect(await isMessagesAllowed({ customerId, requiredBalance: 1 })).toBe(
			false,
		);
	},
);

test.concurrent(
	`${chalk.yellowBright("allocate-customer3: shares stay whole after customer-level usage")}`,
	async () => {
		const customerId = "allocate-customer-3";
		const { a, b } = await setupPartialAllocation({ customerId });

		await trackMessages({ customerId, value: 2000 });
		await expectMessagesBalance({
			autumn: autumnV2_3,
			customerId,
			expected: { remaining: 8000 },
		});

		await trackMessages({ customerId, entityId: a, value: 6000 });
		await trackMessages({ customerId, entityId: b, value: 2000 });
		await expectMessagesBalance({
			autumn: autumnV2_3,
			customerId,
			expected: { remaining: 0 },
		});
	},
);
