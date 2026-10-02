/**
 * check for allocated customers counts own share + unallocated credits, never other entities' shares.
 *
 * Red (before):  check ignores allocations: C is allowed against A and B's shares.
 * Green (after): check agrees with what track would let each entity draw.
 */

import { expect, test } from "bun:test";
import { ApiVersion, ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";

const autumnV2_3 = new AutumnInt({ version: ApiVersion.V2_3 });

const allowedFor = async ({
	customerId,
	entityId,
	requiredBalance,
}: {
	customerId: string;
	entityId: string;
	requiredBalance: number;
}) => {
	const response = await autumnV2_3.check({
		customer_id: customerId,
		entity_id: entityId,
		feature_id: TestFeature.Messages,
		required_balance: requiredBalance,
	});
	return response.allowed;
};

test.concurrent(
	`${chalk.yellowBright("allocate-check1: allowed = own share + unallocated, never another entity's share")}`,
	async () => {
		const customerId = "allocate-check-1";
		const shared = products.base({
			id: `${customerId}-shared`,
			items: [items.monthlyMessages({ includedUsage: 10000 })],
		});
		const { entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [shared] }),
				s.entities({ count: 3, featureId: TestFeature.Users }),
			],
			actions: [s.billing.attach({ productId: shared.id })],
		});
		const [a, b, c] = entities.map((entity) => entity.id);

		await autumnV2_3.customers.update(customerId, {
			billing_controls: {
				balance_allocations: [
					{
						feature_id: TestFeature.Messages,
						interval: ResetInterval.Month,
						allocations: [
							{ entity_id: a, amount: 6000 },
							{ entity_id: b, amount: 2000 },
						],
					},
				],
			},
		});
		await autumnV2_3.customers.get(customerId);
		for (const entityId of [a, b, c])
			await autumnV2_3.entities.get(customerId, entityId);

		// 2000 unallocated: C may use it, but not 2001.
		expect(
			await allowedFor({ customerId, entityId: c, requiredBalance: 2000 }),
		).toBe(true);
		expect(
			await allowedFor({ customerId, entityId: c, requiredBalance: 2001 }),
		).toBe(false);

		// A: 6000 own + 2000 unallocated.
		expect(
			await allowedFor({ customerId, entityId: a, requiredBalance: 8000 }),
		).toBe(true);
		expect(
			await allowedFor({ customerId, entityId: a, requiredBalance: 8001 }),
		).toBe(false);
	},
);
