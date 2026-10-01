/**
 * Deleting an allocated entity releases its share in the same request.
 *
 * Red (before):  the deleted entity's 5k stays allocated; unallocated stays 0.
 * Green (after): only B's 5k is allocated; A's unused share becomes unallocated.
 */

import { expect, test } from "bun:test";
import { type ApiBalanceV1, ApiVersion, ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { pollUntilAsserted } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { fetchActivePlanCusEnt } from "../utils/usage-limit-utils/usageWindowDbTestUtils.js";

const autumnV2_3 = new AutumnInt({ version: ApiVersion.V2_3 });

type WithBalances = { balances: Record<string, ApiBalanceV1> };

test.concurrent(
	`${chalk.yellowBright("allocate-delete1: deleting an allocated entity releases its share")}`,
	async () => {
		const customerId = "allocate-delete-1";
		const shared = products.base({
			id: `${customerId}-shared`,
			items: [items.monthlyMessages({ includedUsage: 10000 })],
		});
		const { entities, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [shared] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [s.billing.attach({ productId: shared.id })],
		});
		const [a, b] = entities.map((entity) => entity.id);

		await autumnV2_3.balances.allocate({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			interval: ResetInterval.Month,
			allocations: [
				{ entity_id: a, amount: 5000 },
				{ entity_id: b, amount: 5000 },
			],
		});
		await autumnV2_3.customers.get(customerId);
		for (const entityId of [a, b])
			await autumnV2_3.entities.get(customerId, entityId);
		await autumnV2_3.track({
			customer_id: customerId,
			entity_id: a,
			feature_id: TestFeature.Messages,
			value: 2000,
		});

		// Delete drops the cache, so let the track reach Postgres first.
		await pollUntilAsserted({
			fetch: () =>
				fetchActivePlanCusEnt({
					ctx,
					customerId,
					featureId: TestFeature.Messages,
				}),
			assert: (cusEnt) => expect(Number(cusEnt?.balance)).toBe(8000),
		});
		await autumnV2_3.entities.delete(customerId, a);

		const balance = (await autumnV2_3.customers.get<WithBalances>(customerId))
			.balances[TestFeature.Messages];
		expect(balance).toMatchObject({
			remaining: 8000,
			allocated: 5000,
			unallocated: 3000,
		});
	},
);
