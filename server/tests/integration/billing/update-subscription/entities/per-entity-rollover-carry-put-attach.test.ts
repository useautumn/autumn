// updateSubscription must carry rollovers bucket-for-bucket (prepaid -> prepaid, overage -> overage)
// when one feature has both a prepaid (volume) and an overage item with per-entity balances.

import { expect, test } from "bun:test";
import {
	type ApiEntityV0,
	BillingInterval,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import chalk from "chalk";
import { entityRolloverBalances } from "./entityRolloverBalances";
import {
	buildApiItems,
	buildItems,
	expectedRollovers,
	setupPrepaidOverageEntities,
} from "./utils/perEntityRolloverCarry";

test.concurrent(
	`${chalk.yellowBright("entity rollover carry: PUT-style customize.items keeps bucket rollovers")}`,
	async () => {
		const { customerId, autumnV1, autumnV2_2, entities, pro } =
			await setupPrepaidOverageEntities({
				customerId: "ent-rollover-carry-put-items",
			});

		const apiItems = buildApiItems();

		// PUT-style: replace the full item list; both feature items stay identical.
		await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: pro.id,
			customize: {
				items: [apiItems.prepaidVolume, apiItems.overage],
				price: { amount: 35, interval: BillingInterval.Month },
			},
		});

		for (const entity of entities) {
			const entityAfter = await autumnV1.entities.get<ApiEntityV0>(
				customerId,
				entity.id,
			);
			expect(
				entityRolloverBalances(entityAfter),
				`rollovers lost or misplaced for ${entity.id} after PUT-style items update`,
			).toEqual(expectedRollovers);
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("entity rollover carry: attach plan switch (new customer product) keeps bucket rollovers")}`,
	async () => {
		const switchItems = buildItems();
		const pro2 = products.base({
			id: "pro2",
			items: [
				switchItems.prepaidVolumeMessages,
				switchItems.overageMessages,
				items.monthlyPrice({ price: 40 }),
			],
		});

		const { customerId, autumnV1, autumnV2_2, entities } =
			await setupPrepaidOverageEntities({
				customerId: "ent-rollover-carry-attach-switch",
				extraProducts: [pro2],
			});

		// Plan switch via attach: a brand-new customer product replaces the old
		// one; both plans contain the same prepaid + overage items.
		await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: pro2.id,
			options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
		});

		for (const entity of entities) {
			const entityAfter = await autumnV1.entities.get<ApiEntityV0>(
				customerId,
				entity.id,
			);
			expect(
				entityRolloverBalances(entityAfter),
				`rollovers lost or misplaced for ${entity.id} after attach plan switch`,
			).toEqual(expectedRollovers);
		}
	},
);
