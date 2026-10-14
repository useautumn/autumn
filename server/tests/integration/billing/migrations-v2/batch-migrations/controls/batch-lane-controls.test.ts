import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	MigrationItemRunStatus,
	migrationItemRuns,
} from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { and, eq } from "drizzle-orm";
import { runChunkedMigration } from "../../utils/runChunkedMigration";
import {
	expectMigrationItemRunStatus,
	getInternalCustomerId,
} from "../batchTestUtils";
import {
	addWordsOperation,
	expectWordsOnPlans,
} from "../operation-scope/operationScopeTestUtils";

const runWordsMigration = async ({
	ctx,
	migrationClient,
	migrationId,
	planId,
	planFilter,
	controls,
}: {
	// biome-ignore lint/suspicious/noExplicitAny: scenario ctx/client passthrough
	ctx: any;
	// biome-ignore lint/suspicious/noExplicitAny: scenario ctx/client passthrough
	migrationClient: any;
	migrationId: string;
	planId: string;
	planFilter?: Record<string, unknown>;
	controls?: {
		only?: string[];
		retryItemStatuses?: ("failed" | "skipped")[];
	};
}) => {
	const run = await runChunkedMigration({
		ctx,
		migrationClient,
		migrationId,
		filter: { customer: { plan: { plan_id: planId } } },
		operations: addWordsOperation({
			planFilter: { plan_id: planId, ...(planFilter ?? {}) },
		}),
		noBillingChanges: true,
		controls,
	});
	expect(run.result?.lane).toBe("batch");
	return run;
};

test.concurrent(
	`${chalk.yellowBright("batch controls: only claims exactly the targeted customers, on the batch lane")}`,
	async () => {
		const targetId = "batch-ctrl-only-target";
		const bystanderId = "batch-ctrl-only-bystander";
		const plan = products.base({ id: "batch-ctrl-only-plan", items: [] });

		const { autumnV2_2, ctx } = await initScenario({
			customerId: targetId,
			setup: [
				s.customer(),
				s.otherCustomers([{ id: bystanderId }]),
				s.products({ list: [plan] }),
			],
			actions: [
				s.parallel(
					s.billing.attach({ productId: plan.id }),
					s.billing.attach({ customerId: bystanderId, productId: plan.id }),
				),
			],
		});

		const { migration } = await runWordsMigration({
			ctx,
			migrationClient: autumnV2_2,
			migrationId: "batch-ctrl-only-mig",
			planId: plan.id,
			controls: { only: [targetId] },
		});

		expectWordsOnPlans({
			customer: await autumnV2_2.customers.get<ApiCustomerV5>(targetId),
			planIds: [plan.id],
		});
		expectWordsOnPlans({
			customer: await autumnV2_2.customers.get<ApiCustomerV5>(bystanderId),
			planIds: [],
		});

		const bystanderInternalId = await getInternalCustomerId({
			ctx,
			customerId: bystanderId,
		});
		const bystanderRuns = await ctx.db
			.select()
			.from(migrationItemRuns)
			.where(
				and(
					eq(migrationItemRuns.migration_internal_id, migration.internal_id),
					eq(migrationItemRuns.item_id, bystanderInternalId),
				),
			);
		expect(bystanderRuns).toHaveLength(0);
	},
);

test.concurrent(
	`${chalk.yellowBright("batch controls: retry skipped re-claims skipped rows without double-adding succeeded ones")}`,
	async () => {
		const plainId = "batch-ctrl-reskip-plain";
		const customizedId = "batch-ctrl-reskip-customized";
		const plan = products.base({ id: "batch-ctrl-reskip-plan", items: [] });

		const { autumnV2_2, ctx } = await initScenario({
			customerId: plainId,
			setup: [
				s.customer(),
				s.otherCustomers([{ id: customizedId }]),
				s.products({ list: [plan] }),
			],
			actions: [
				s.parallel(
					s.billing.attach({ productId: plan.id }),
					s.billing.attach({
						customerId: customizedId,
						productId: plan.id,
						items: [items.freeAllocatedWorkflows({ includedUsage: 25 })],
					}),
				),
			],
		});

		const first = await runWordsMigration({
			ctx,
			migrationClient: autumnV2_2,
			migrationId: "batch-ctrl-reskip-mig",
			planId: plan.id,
			planFilter: { custom: false },
		});
		await expectMigrationItemRunStatus({
			ctx,
			migrationInternalId: first.migration.internal_id,
			migrationRunId: first.migrationRunId,
			customerId: customizedId,
			status: MigrationItemRunStatus.Skipped,
		});

		const retry = await runWordsMigration({
			ctx,
			migrationClient: autumnV2_2,
			migrationId: "batch-ctrl-reskip-mig",
			planId: plan.id,
			planFilter: { custom: false },
			controls: { retryItemStatuses: ["skipped"] },
		});
		await expectMigrationItemRunStatus({
			ctx,
			migrationInternalId: retry.migration.internal_id,
			migrationRunId: retry.migrationRunId,
			customerId: customizedId,
			status: MigrationItemRunStatus.Skipped,
		});

		expectWordsOnPlans({
			customer: await autumnV2_2.customers.get<ApiCustomerV5>(plainId),
			planIds: [plan.id],
		});
		expectWordsOnPlans({
			customer: await autumnV2_2.customers.get<ApiCustomerV5>(customizedId),
			planIds: [],
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("batch controls: retry failed re-claims a failed row and completes it")}`,
	async () => {
		const customerId = "batch-ctrl-refail";
		const plan = products.base({ id: "batch-ctrl-refail-plan", items: [] });

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [s.customer(), s.products({ list: [plan] })],
			actions: [s.billing.attach({ productId: plan.id })],
		});

		const first = await runWordsMigration({
			ctx,
			migrationClient: autumnV2_2,
			migrationId: "batch-ctrl-refail-mig",
			planId: plan.id,
		});
		expectWordsOnPlans({
			customer: await autumnV2_2.customers.get<ApiCustomerV5>(customerId),
			planIds: [plan.id],
		});

		const internalCustomerId = await getInternalCustomerId({ ctx, customerId });
		await ctx.db
			.update(migrationItemRuns)
			.set({ status: MigrationItemRunStatus.Failed })
			.where(
				and(
					eq(
						migrationItemRuns.migration_internal_id,
						first.migration.internal_id,
					),
					eq(migrationItemRuns.item_id, internalCustomerId),
				),
			);

		const retry = await runWordsMigration({
			ctx,
			migrationClient: autumnV2_2,
			migrationId: "batch-ctrl-refail-mig",
			planId: plan.id,
			controls: { retryItemStatuses: ["failed"] },
		});
		await expectMigrationItemRunStatus({
			ctx,
			migrationInternalId: retry.migration.internal_id,
			migrationRunId: retry.migrationRunId,
			customerId,
			status: MigrationItemRunStatus.Skipped,
		});
		expectWordsOnPlans({
			customer: await autumnV2_2.customers.get<ApiCustomerV5>(customerId),
			planIds: [plan.id],
		});
	},
);
