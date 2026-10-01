/**
 * balances.allocate holds shares of a customer's shared monthly credits for entities.
 *
 * Contract:
 *   POST /balances.allocate { customer_id, feature_id, interval, allocations[] }
 *     -> { allocations[{ entity_id, amount, granted, usage, remaining }], shared{ granted, remaining, allocated, unallocated } }
 *   An entity draws its own share, then unallocated credits; never another entity's share.
 *   First call: usage from before tracking is absorbed from the end of the list.
 *   Errors: duplicate entity, unknown entity, over-allocation, wrong interval.
 *
 * Red (before):  the route doesn't exist.
 * Green (after): responses and gating as above.
 */

import { expect, test } from "bun:test";
import {
	type AllocateBalancesParamsV0,
	ApiVersion,
	ResetInterval,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { expectSharedRemaining } from "./utils/expectSharedRemaining.js";

const autumnV2_3 = new AutumnInt({ version: ApiVersion.V2_3 });

const setupSharedPool = async ({ customerId }: { customerId: string }) => {
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
	await warmCaches({ customerId });
	return { a: entities[0].id, b: entities[1].id, c: entities[2].id };
};

// Warms the customer and entity caches so an entity track isn't lost to a cold customer refill.
const warmCaches = async ({ customerId }: { customerId: string }) => {
	await autumnV2_3.customers.get(customerId);
	for (const entityId of ["ent-1", "ent-2", "ent-3"])
		await autumnV2_3.entities.get(customerId, entityId);
};

const allocate = async ({
	customerId,
	allocations,
}: {
	customerId: string;
	allocations: AllocateBalancesParamsV0["allocations"];
}) => {
	const response = await autumnV2_3.balances.allocate({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		interval: ResetInterval.Month,
		allocations,
	});
	await warmCaches({ customerId });
	return response;
};

const trackAs = ({
	customerId,
	entityId,
	value,
}: {
	customerId: string;
	entityId: string;
	value: number;
}) =>
	autumnV2_3.track({
		customer_id: customerId,
		entity_id: entityId,
		feature_id: TestFeature.Messages,
		value,
	});

test.concurrent(
	`${chalk.yellowBright("allocate1: Kyle's split — A is held to its 5k share, B keeps its 5k")}`,
	async () => {
		const customerId = "allocate-gate-1";
		const { a, b, c } = await setupSharedPool({ customerId });

		const response = await allocate({
			customerId,
			allocations: [
				{ entity_id: a, amount: 5000 },
				{ entity_id: b, amount: 5000 },
			],
		});
		expect(response.allocations).toMatchObject([
			{ entity_id: a, amount: 5000, granted: 5000, usage: 0, remaining: 5000 },
			{ entity_id: b, amount: 5000, granted: 5000, usage: 0, remaining: 5000 },
		]);
		expect(response.shared).toEqual({
			granted: 10000,
			remaining: 10000,
			allocated: 10000,
			unallocated: 0,
		});

		await trackAs({ customerId, entityId: a, value: 8000 });
		await expectSharedRemaining({
			customerId,
			autumn: autumnV2_3,
			remaining: 5000,
		});

		// C has no share and nothing is unallocated.
		await trackAs({ customerId, entityId: c, value: 100 });
		await expectSharedRemaining({
			customerId,
			autumn: autumnV2_3,
			remaining: 5000,
		});

		await trackAs({ customerId, entityId: b, value: 5000 });
		await expectSharedRemaining({
			customerId,
			autumn: autumnV2_3,
			remaining: 0,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("allocate2: first call — usage before tracking is absorbed from the end of the list")}`,
	async () => {
		const customerId = "allocate-gap-2";
		const { a, b } = await setupSharedPool({ customerId });

		await trackAs({ customerId, entityId: a, value: 4000 });

		const response = await allocate({
			customerId,
			allocations: [
				{ entity_id: a, amount: 5000 },
				{ entity_id: b, amount: 5000 },
			],
		});
		expect(response.allocations).toMatchObject([
			{ entity_id: a, granted: 5000, usage: 0, remaining: 5000 },
			{ entity_id: b, granted: 5000, usage: 4000, remaining: 1000 },
		]);
		expect(response.shared).toEqual({
			granted: 10000,
			remaining: 6000,
			allocated: 10000,
			unallocated: 0,
		});

		// Later calls count real usage: releasing and re-adding B gives no fresh 5k.
		await allocate({ customerId, allocations: [{ entity_id: b, amount: 0 }] });
		const readded = await allocate({
			customerId,
			allocations: [{ entity_id: b, amount: 5000 }],
		});
		expect(readded.allocations).toMatchObject([
			{ entity_id: b, granted: 5000, usage: 4000, remaining: 1000 },
		]);
	},
);

test.concurrent(
	`${chalk.yellowBright("allocate3: rejects duplicates, unknown entities, over-allocation and other intervals")}`,
	async () => {
		const customerId = "allocate-errors-3";
		const { a, b } = await setupSharedPool({ customerId });

		await expectAutumnError({
			errCode: "duplicate_allocation_entity",
			func: () =>
				allocate({
					customerId,
					allocations: [
						{ entity_id: a, amount: 1 },
						{ entity_id: a, amount: 2 },
					],
				}),
		});
		await expectAutumnError({
			errCode: "entity_not_found",
			func: () =>
				allocate({
					customerId,
					allocations: [{ entity_id: "missing-entity", amount: 1 }],
				}),
		});
		await expectAutumnError({
			errCode: "allocation_exceeds_available",
			func: () =>
				allocate({
					customerId,
					allocations: [
						{ entity_id: a, amount: 6000 },
						{ entity_id: b, amount: 5000 },
					],
				}),
		});
		await expectAutumnError({
			errCode: "no_shared_balance_for_interval",
			func: () =>
				autumnV2_3.balances.allocate({
					customer_id: customerId,
					feature_id: TestFeature.Messages,
					interval: ResetInterval.Year,
					allocations: [{ entity_id: a, amount: 1 }],
				}),
		});
	},
);
