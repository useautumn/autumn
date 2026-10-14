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
