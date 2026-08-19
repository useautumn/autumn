/**
 * Entity-attached customer products (non-entity-scoped ITEMS — entity_feature_id
 * items reject): every per-entity row repoints on the batch lane and the
 * projected per-entity state matches the per-customer lane.
 */
import { expect, test } from "bun:test";
import type { ApiEntityV2 } from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import {
	REPOINTABLE_STATUSES,
	readCustomerPlanRows,
} from "../utils/versionRepointTestUtils";
import {
	migrateVersionOnBatchLane,
	migrateVersionOnPerCustomerLane,
	mintPlanVersion,
	uniqueStem,
} from "./versionParityTestUtils";

const repointableStatuses = new Set<string>(REPOINTABLE_STATUSES);

test.concurrent(
	`${chalk.yellowBright("batch version repoint parity: entity-attached products repoint per entity")}`,
	async () => {
		const stem = uniqueStem("bvr-parity-entity");
		const batchCustomerId = `${stem}-batch`;
		const perCustomerId = `${stem}-customer`;
		const twinEntityIds = [`${stem}-twin-ent-1`, `${stem}-twin-ent-2`];
		const batchPlan = products.base({
			id: `${stem}-plan-a`,
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const perCustomerPlan = products.base({
			id: `${stem}-plan-b`,
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { autumnV1, autumnV2_3, ctx, entities } = await initScenario({
			customerId: batchCustomerId,
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
				s.otherCustomers([{ id: perCustomerId }]),
				s.products({ list: [batchPlan, perCustomerPlan] }),
			],
			actions: [],
		});
		await autumnV1.entities.create(
			perCustomerId,
			twinEntityIds.map((entityId, index) => ({
				id: entityId,
				name: `Twin entity ${index + 1}`,
				feature_id: TestFeature.Users,
			})),
		);
		for (const entity of entities) {
			await autumnV2_3.billing.attach({
				customer_id: batchCustomerId,
				plan_id: batchPlan.id,
				entity_id: entity.id,
			});
		}
		for (const entityId of twinEntityIds) {
			await autumnV2_3.billing.attach({
				customer_id: perCustomerId,
				plan_id: perCustomerPlan.id,
				entity_id: entityId,
			});
		}

		for (const planId of [batchPlan.id, perCustomerPlan.id]) {
			await mintPlanVersion({
				autumnV2_3,
				planId,
				items: [itemsV2.monthlyMessages({ included: 200 })],
			});
		}
		await migrateVersionOnBatchLane({
			ctx,
			migrationClient: autumnV2_3,
			migrationId: `${stem}-batch-migration`,
			planId: batchPlan.id,
		});
		await migrateVersionOnPerCustomerLane({
			ctx,
			migrationClient: autumnV2_3,
			migrationId: `${stem}-customer-migration`,
			planId: perCustomerPlan.id,
			customerId: perCustomerId,
		});

		for (const [customerId, planId, entityIds] of [
			[batchCustomerId, batchPlan.id, entities.map(({ id }) => id)],
			[perCustomerId, perCustomerPlan.id, twinEntityIds],
		] as const) {
			// Live rows only — the per-customer lane leaves expired v1 rows behind,
			// so row identity/count is never compared across lanes beyond this.
			const liveRows = (
				await readCustomerPlanRows({ ctx, customerId, planId })
			).filter(
				(row) => row.status !== null && repointableStatuses.has(row.status),
			);
			expect(liveRows).toHaveLength(2);
			for (const row of liveRows) {
				expect(row.version).toBe(2);
				expect(row.internalEntityId).not.toBeNull();
			}

			for (const entityId of entityIds) {
				expectBalanceCorrect({
					customer: await autumnV2_3.entities.get<ApiEntityV2>(
						customerId,
						entityId,
					),
					featureId: TestFeature.Messages,
					remaining: 200,
					usage: 0,
					planId,
				});
			}
		}
	},
);
