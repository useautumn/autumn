// updateSubscription must carry rollovers bucket-for-bucket (prepaid -> prepaid, overage -> overage)
// when one feature has both a prepaid (volume) and an overage item with per-entity balances.

import { expect, test } from "bun:test";
import {
	type ApiEntityV0,
	BillingMethod,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import chalk from "chalk";
import { entityRolloverBalances } from "./entityRolloverBalances";
import {
	buildApiItems,
	expectedRollovers,
	setupPrepaidOverageEntities,
} from "./utils/perEntityRolloverCarry";

test.concurrent(
	`${chalk.yellowBright("entity rollover carry: patch updating both same-feature items keeps bucket rollovers")}`,
	async () => {
		const { customerId, autumnV1, autumnV2_2, entities, pro } =
			await setupPrepaidOverageEntities({
				customerId: "ent-rollover-carry-patch-both",
			});

		// Patch path: update BOTH same-feature items in one call so both cusEnts
		// are rebuilt and land in the same feature carry group.
		await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: pro.id,
			customize: {
				update_items: [
					{
						filter: {
							feature_id: TestFeature.Messages,
							billing_method: BillingMethod.Prepaid,
						},
						// Must stay a multiple of billingUnits (100) so the Stripe
						// prepaid quantity remains an integer pack count.
						included: 200,
					},
					{
						filter: {
							feature_id: TestFeature.Messages,
							billing_method: BillingMethod.UsageBased,
						},
						included: 60,
					},
				],
			},
		});

		for (const entity of entities) {
			const entityAfter = await autumnV1.entities.get<ApiEntityV0>(
				customerId,
				entity.id,
			);
			expect(
				entityRolloverBalances(entityAfter),
				`rollovers lost or misplaced for ${entity.id} after patch update`,
			).toEqual(expectedRollovers);
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("entity rollover carry: remove_items + add_items keeps bucket rollovers")}`,
	async () => {
		const { customerId, autumnV1, autumnV2_2, entities, pro } =
			await setupPrepaidOverageEntities({
				customerId: "ent-rollover-carry-remove-add",
			});

		const apiItems = buildApiItems();

		// PATCH-style: remove both same-feature items and re-add equivalents.
		await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: pro.id,
			customize: {
				remove_items: [
					{
						feature_id: TestFeature.Messages,
						billing_method: BillingMethod.Prepaid,
					},
					{
						feature_id: TestFeature.Messages,
						billing_method: BillingMethod.UsageBased,
					},
				],
				add_items: [apiItems.prepaidVolume, apiItems.overage],
			},
		});

		for (const entity of entities) {
			const entityAfter = await autumnV1.entities.get<ApiEntityV0>(
				customerId,
				entity.id,
			);
			expect(
				entityRolloverBalances(entityAfter),
				`rollovers lost or misplaced for ${entity.id} after remove+add update`,
			).toEqual(expectedRollovers);
		}
	},
);
