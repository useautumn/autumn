/**
 * TDD coverage: the BATCH lane must migrate SCHEDULED customer products.
 *
 * Contract under test:
 *   New behaviors:
 *     - a premium → pro downgrade leaves pro as a scheduled row; an add_items
 *       migration targeting pro runs on the BATCH lane and adds the item to
 *       that scheduled row (MIGRATABLE_STATUSES includes `scheduled`);
 *     - the active premium row is untouched (targeting isolation), so no
 *       ACTIVE row carries the added feature.
 *   Side effects:
 *     - the customer's item run lands succeeded (a row was mutated).
 */

import { expect, test } from "bun:test";
import { type ApiCustomerV5, MigrationItemRunStatus } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import {
	getCustomerProductFeatureIds,
	getScheduledCustomerProductRow,
} from "../../update-plan-operation/utils/scheduledCustomerProductTestUtils";
import { runChunkedMigration } from "../../utils/runChunkedMigration";
import { expectMigrationItemRunStatus } from "../batchTestUtils";
import {
	addWordsOperation,
	expectWordsOnPlans,
} from "../operation-scope/operationScopeTestUtils";

test.concurrent(
	`${chalk.yellowBright("batch migration: add_items lands on a SCHEDULED customer product from a downgrade")}`,
	async () => {
		const customerId = "batch-scheduled-add";
		const pro = products.pro({
			id: "batch-scheduled-add-pro",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});
		const premium = products.premium({
			id: "batch-scheduled-add-premium",
			items: [items.monthlyMessages({ includedUsage: 1000 })],
		});

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [
				// Downgrade: premium stays active, pro becomes a scheduled row.
				s.billing.attach({ productId: premium.id }),
				s.billing.attach({ productId: pro.id }),
			],
		});

		const scheduledBefore = await getScheduledCustomerProductRow({
			ctx,
			customerId,
			productId: pro.id,
		});

		const { migration, migrationRunId, result } = await runChunkedMigration({
			ctx,
			migrationClient: autumnV2_2,
			migrationId: "batch-scheduled-add-mig",
			filter: { customer: { plan: { plan_id: pro.id } } },
			operations: addWordsOperation({ planFilter: { plan_id: pro.id } }),
			noBillingChanges: true,
		});
		expect(result?.lane).toBe("batch");

		// ── Contract: the scheduled row itself gained the item, in place ──
		const scheduledAfter = await getScheduledCustomerProductRow({
			ctx,
			customerId,
			productId: pro.id,
		});
		expect(scheduledAfter.id).toBe(scheduledBefore.id);
		expect(
			await getCustomerProductFeatureIds({
				ctx,
				customerProductId: scheduledAfter.id,
			}),
		).toContain(TestFeature.Words);

		// ── Contract: no ACTIVE row (premium) carries the feature ──
		expectWordsOnPlans({
			customer: await autumnV2_2.customers.get<ApiCustomerV5>(customerId),
			planIds: [],
		});

		await expectMigrationItemRunStatus({
			ctx,
			migrationInternalId: migration.internal_id,
			migrationRunId,
			customerId,
			status: MigrationItemRunStatus.Succeeded,
		});
	},
);
