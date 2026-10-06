import { afterAll, expect, test } from "bun:test";
import { migrationItemRuns } from "@autumn/shared";
import {
	expectBillingUpdatedCorrect,
	listBillingUpdatedWebhooks,
} from "@tests/integration/billing/autumn-webhooks/utils/expectBillingUpdatedWebhook.js";
import {
	getTestSvixAppId,
	setupWebhookTest,
} from "@tests/integration/utils/svixWebhookTestUtils.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import { and, eq } from "drizzle-orm";
import { getInternalCustomerId } from "../batchTestUtils.js";
import { installPageFaults } from "./utils/installPageFaults.js";
import {
	runRecoveryMigration,
	updatePlanAddingItems,
} from "./utils/runRecoveryMigration.js";

const { enqueueFaults, restore } = await installPageFaults();
afterAll(restore);

test("publishing an earlier add retains its original diff after the migration is edited", async () => {
	const customerId = "edited-publish-customer";
	const plan = products.base({ id: "edited-publish-plan", items: [] });
	const { autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false, skipWebhooks: true }),
			s.products({ list: [plan] }),
		],
		actions: [s.billing.attach({ productId: plan.id })],
	});
	const webhook = await setupWebhookTest({
		appId: getTestSvixAppId({ svixConfig: ctx.org.svix_config }),
		filterTypes: ["billing.updated"],
	});
	try {
		const migration = await autumnV2_2.migrationsV2.deleteAndCreate({
			id: `edited-publish-${Date.now().toString(36)}`,
			filter: { customer: { plan: { plan_id: plan.id } } },
			operations: {
				customer: [
					updatePlanAddingItems({
						planId: plan.id,
						addItems: [{ feature_id: TestFeature.Workflows, included: 10 }],
					}),
				],
			},
			no_billing_changes: true,
		});
		enqueueFaults.set(customerId, ["before_send", "before_send"]);
		await runRecoveryMigration({ ctx, migration });
		enqueueFaults.delete(customerId);
		const internalCustomerId = await getInternalCustomerId({ ctx, customerId });
		const [pending] = await ctx.db
			.select()
			.from(migrationItemRuns)
			.where(
				and(
					eq(migrationItemRuns.migration_internal_id, migration.internal_id),
					eq(migrationItemRuns.item_id, internalCustomerId),
				),
			);
		expect(pending.unpublished_changes).toHaveLength(1);
		const pageBytes = Buffer.byteLength(
			JSON.stringify(
				Array.from({ length: 5000 }, () => pending.unpublished_changes),
			),
		);
		ctx.logger.info(
			`migration recovery synthetic 5000-customer payload: ${pageBytes} bytes, 1 change/customer`,
		);
		const edited = await autumnV2_2.migrationsV2.update({
			id: migration.id,
			updates: {
				operations: {
					customer: [
						updatePlanAddingItems({
							planId: plan.id,
							addItems: [itemsV2.dashboard()],
						}),
					],
				},
			},
		});
		const recovery = await runRecoveryMigration({ ctx, migration: edited });
		expect(recovery.error).toBeUndefined();
		const deliveries = await listBillingUpdatedWebhooks({
			playToken: webhook.playToken,
			customerId,
		});
		expect(deliveries).toHaveLength(1);
		expectBillingUpdatedCorrect({
			data: deliveries[0],
			customerId,
			planChanges: [
				{
					planId: plan.id,
					itemChanges: [
						{
							action: "created",
							featureId: TestFeature.Workflows,
							included: 10,
						},
					],
				},
			],
		});
	} finally {
		enqueueFaults.delete(customerId);
		await webhook.cleanup();
	}
});
