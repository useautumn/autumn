// updateSubscription must carry rollovers bucket-for-bucket (prepaid -> prepaid, overage -> overage)
// when one feature has both a prepaid (volume) and an overage item with per-entity balances.

import { expect, test } from "bun:test";
import type { ApiCustomerV5, ApiEntityV0 } from "@autumn/shared";
import { runUpdatePlanMigration } from "@tests/integration/billing/migrations-v2/utils/runUpdatePlanMigration";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import chalk from "chalk";
import { entityRolloverBalances } from "./entityRolloverBalances";
import {
	buildItems,
	expectedRollovers,
	setupPrepaidOverageEntities,
} from "./utils/perEntityRolloverCarry";

test.concurrent(
	`${chalk.yellowBright("entity rollover carry: prepaid volume + overage rollovers survive version update")}`,
	async () => {
		const {
			customerId,
			autumnV1,
			autumnV2_2,
			entities,
			pro,
			prepaidVolumeMessages,
			overageMessages,
		} = await setupPrepaidOverageEntities({
			customerId: "ent-rollover-carry-prepaid-overage",
		});

		const customerBefore =
			await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		const remainingBefore =
			customerBefore.balances[TestFeature.Messages].remaining;

		// v2 keeps BOTH feature items identical; only the base price changes.
		await autumnV1.products.update(pro.id, {
			items: [
				prepaidVolumeMessages,
				overageMessages,
				items.monthlyPrice({ price: 35 }),
			],
		});

		await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: pro.id,
			version: 2,
		});

		for (const entity of entities) {
			const entityAfter = await autumnV1.entities.get<ApiEntityV0>(
				customerId,
				entity.id,
			);
			expect(
				entityRolloverBalances(entityAfter),
				`rollovers lost or misplaced for ${entity.id} after version update`,
			).toEqual(expectedRollovers);
		}

		const customerAfter =
			await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: customerAfter,
			featureId: TestFeature.Messages,
			remaining: remainingBefore,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("entity rollover carry: migration (updateSubscription contextOverride) keeps bucket rollovers")}`,
	async () => {
		const { customerId, autumnV1, autumnV2_2, entities, ctx, pro } =
			await setupPrepaidOverageEntities({
				customerId: "ent-rollover-carry-migration",
			});

		const v2Items = buildItems();
		await autumnV1.products.update(pro.id, {
			items: [
				v2Items.prepaidVolumeMessages,
				v2Items.overageMessages,
				items.monthlyPrice({ price: 45 }),
			],
		});

		// migrate() drives updateSubscription with a productContext override.
		await runUpdatePlanMigration({
			ctx,
			migrationClient: autumnV2_2,
			migrationId: `${customerId}-mig`,
			customerId,
			filter: { customer: { plan: { plan_id: pro.id } } },
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: { plan_id: pro.id },
						version: 2,
					},
				],
			},
			runOnServer: false,
		});

		for (const entity of entities) {
			const entityAfter = await autumnV1.entities.get<ApiEntityV0>(
				customerId,
				entity.id,
			);
			expect(
				entityRolloverBalances(entityAfter),
				`rollovers lost or misplaced for ${entity.id} after version migration`,
			).toEqual(expectedRollovers);
		}
	},
);
