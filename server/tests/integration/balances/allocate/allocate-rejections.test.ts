/**
 * A customer allocates a feature on one interval at a time, and never unlimited credits.
 *
 * Contract:
 *   allocations on another interval while any share is held -> allocation_interval_mismatch
 *   releasing every share frees the feature to be allocated on another interval
 *   unlimited shared credits -> allocations_not_supported_for_unlimited
 */

import { expect, test } from "bun:test";
import { ProductItemInterval, ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import {
	allocateMessages,
	expectAllocatedMessages,
} from "./utils/allocateTestUtils.js";

/** Monthly and yearly shared messages, so either interval can be allocated. */
const setupTwoIntervalPools = async ({
	customerId,
}: {
	customerId: string;
}) => {
	const monthly = products.base({
		id: `${customerId}-monthly`,
		items: [items.monthlyMessages({ includedUsage: 10000 })],
	});
	const yearly = products.base({
		id: `${customerId}-yearly`,
		isAddOn: true,
		items: [
			constructFeatureItem({
				featureId: TestFeature.Messages,
				includedUsage: 50000,
				interval: ProductItemInterval.Year,
			}),
		],
	});
	const { entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [monthly, yearly] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({ productId: monthly.id }),
			s.billing.attach({ productId: yearly.id }),
		],
	});
	return entities.map((entity) => entity.id);
};

test.concurrent(
	`${chalk.yellowBright("allocate-reject1: allocating another interval while a share is held is rejected")}`,
	async () => {
		const customerId = "allocate-reject-1";
		const [a, b] = await setupTwoIntervalPools({ customerId });

		await allocateMessages({
			customerId,
			allocations: [{ entity_id: a, amount: 1000 }],
		});
		await expectAutumnError({
			errCode: "allocation_interval_mismatch",
			func: () =>
				allocateMessages({
					customerId,
					interval: ResetInterval.Year,
					allocations: [{ entity_id: b, amount: 1000 }],
				}),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("allocate-reject2: releasing every share frees the feature for another interval")}`,
	async () => {
		const customerId = "allocate-reject-2";
		const [a, b] = await setupTwoIntervalPools({ customerId });

		await allocateMessages({
			customerId,
			allocations: [{ entity_id: a, amount: 1000 }],
		});
		await allocateMessages({
			customerId,
			allocations: [{ entity_id: a, amount: 0 }],
		});

		const yearly = await allocateMessages({
			customerId,
			interval: ResetInterval.Year,
			allocations: [{ entity_id: b, amount: 20000 }],
		});
		await expectAllocatedMessages({
			customerId,
			response: yearly,
			expected: [{ entity_id: b, amount: 20000, granted: 20000 }],
		});
		expect(yearly.balances[TestFeature.Messages]).toMatchObject({
			granted: 60000,
			allocated: 20000,
		});
		expect(yearly.balances[TestFeature.Messages].breakdown).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					included_grant: 50000,
					reset: expect.objectContaining({ interval: ResetInterval.Year }),
				}),
			]),
		);

		await expectAutumnError({
			errCode: "allocation_interval_mismatch",
			func: () =>
				allocateMessages({
					customerId,
					allocations: [{ entity_id: a, amount: 1000 }],
				}),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("allocate-reject3: unlimited shared credits can't be allocated")}`,
	async () => {
		const customerId = "allocate-reject-3";
		const unlimited = products.base({
			id: `${customerId}-unlimited`,
			items: [
				items.unlimited({
					featureId: TestFeature.Messages,
					interval: ProductItemInterval.Month,
				}),
			],
		});
		const { entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [unlimited] }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
			],
			actions: [s.billing.attach({ productId: unlimited.id })],
		});

		await expectAutumnError({
			errCode: "allocations_not_supported_for_unlimited",
			func: () =>
				allocateMessages({
					customerId,
					allocations: [{ entity_id: entities[0].id, amount: 1000 }],
				}),
		});
	},
);
