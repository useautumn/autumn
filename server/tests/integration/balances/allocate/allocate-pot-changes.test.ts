/**
 * When shared credits shrink below what's been allocated, every share is cut by the same
 * proportion; when they grow back, shares return to the requested amounts.
 *
 * Red (before):  shares stay at 5k after the add-on goes, promising credits that don't exist.
 * Green (after): 6k left for 10k promised → each share 3k; re-adding the add-on → 5k again.
 */

import { expect, test } from "bun:test";
import { type ApiBalanceV1, ApiVersion, ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";

const autumnV2_3 = new AutumnInt({ version: ApiVersion.V2_3 });

type WithBalances = { balances: Record<string, ApiBalanceV1> };

const entityGranted = async ({
	customerId,
	entityId,
}: {
	customerId: string;
	entityId: string;
}) =>
	(await autumnV2_3.entities.get<WithBalances>(customerId, entityId)).balances[
		TestFeature.Messages
	].granted;

test.concurrent(
	`${chalk.yellowBright("allocate-pot1: shares shrink proportionally with the pot and recover when it grows back")}`,
	async () => {
		const customerId = "allocate-pot-1";
		const base = products.base({
			id: `${customerId}-base`,
			items: [items.monthlyMessages({ includedUsage: 6000 })],
		});
		const addOn = products.base({
			id: `${customerId}-addon`,
			isAddOn: true,
			items: [items.monthlyMessages({ includedUsage: 4000 })],
		});
		const { entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [base, addOn] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({ productId: base.id }),
				s.billing.attach({ productId: addOn.id }),
			],
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

		await autumnV2_3.subscriptions.update({
			customer_id: customerId,
			plan_id: addOn.id,
			cancel_action: "cancel_immediately",
		});
		expect(await entityGranted({ customerId, entityId: a })).toBe(3000);
		expect(await entityGranted({ customerId, entityId: b })).toBe(3000);
		const shrunk = (await autumnV2_3.customers.get<WithBalances>(customerId))
			.balances[TestFeature.Messages];
		expect(shrunk).toMatchObject({
			remaining: 6000,
			allocated: 6000,
			unallocated: 0,
		});

		await autumnV2_3.billing.attach({
			customer_id: customerId,
			plan_id: addOn.id,
		});
		expect(await entityGranted({ customerId, entityId: a })).toBe(5000);
		expect(await entityGranted({ customerId, entityId: b })).toBe(5000);
	},
);
