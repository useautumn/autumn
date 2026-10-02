/**
 * Allocated entities see their share on the shared row; customers see how much is allocated.
 *
 * Contract:
 *   entities.get (allocated): shared breakdown row keeps its id, source "customer",
 *     included_grant/usage/remaining scoped to the share, allocation { amount }.
 *   entities.get (not allocated): full shared row, allocation null.
 *   customers.get: balance gains allocated / unallocated; breakdown rows carry source.
 *
 * Red (before):  no source/allocation fields; entity rows show the whole pool.
 * Green (after): the fields above.
 */

import { expect, test } from "bun:test";
import {
	type ApiBalanceBreakdownV1,
	type ApiBalanceV1,
	ApiVersion,
	ResetInterval,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";

const autumnV2_3 = new AutumnInt({ version: ApiVersion.V2_3 });

type WithBalances = { balances: Record<string, ApiBalanceV1> };

const messagesOf = (subject: WithBalances) =>
	subject.balances[TestFeature.Messages];

test.concurrent(
	`${chalk.yellowBright("allocate-responses1: entities show their share, the customer shows allocated / unallocated")}`,
	async () => {
		const customerId = "allocate-responses-1";
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
		await autumnV2_3.customers.get(customerId);
		for (const entityId of [a, b, c])
			await autumnV2_3.entities.get(customerId, entityId);

		await autumnV2_3.balances.allocate({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			interval: ResetInterval.Month,
			allocations: [
				{ entity_id: a, amount: 6000 },
				{ entity_id: b, amount: 2000 },
			],
		});
		await autumnV2_3.customers.get(customerId);
		for (const entityId of [a, b, c])
			await autumnV2_3.entities.get(customerId, entityId);
		await autumnV2_3.track({
			customer_id: customerId,
			entity_id: a,
			feature_id: TestFeature.Messages,
			value: 1500,
		});

		const customerBalance = messagesOf(
			await autumnV2_3.customers.get<WithBalances>(customerId),
		);
		const sharedRowId = customerBalance.breakdown?.[0]?.id;
		expect(customerBalance).toMatchObject({
			granted: 10000,
			remaining: 8500,
			allocated: 8000,
			unallocated: 2000,
		});
		expect(customerBalance.breakdown?.[0]).toMatchObject({
			source: "customer",
			allocation: null,
		});

		const entityA = messagesOf(
			await autumnV2_3.entities.get<WithBalances>(customerId, a),
		);
		expect(entityA).toMatchObject({
			granted: 6000,
			usage: 1500,
			remaining: 4500,
		});
		expect(entityA.breakdown?.[0]).toMatchObject({
			id: sharedRowId,
			source: "customer",
			included_grant: 6000,
			usage: 1500,
			remaining: 4500,
			allocation: { amount: 6000 },
		} satisfies Partial<ApiBalanceBreakdownV1>);

		const entityC = messagesOf(
			await autumnV2_3.entities.get<WithBalances>(customerId, c),
		);
		expect(entityC).toMatchObject({ granted: 10000, remaining: 8500 });
		expect(entityC.breakdown?.[0]).toMatchObject({
			id: sharedRowId,
			source: "customer",
			allocation: null,
		});
	},
);
