import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	type AttachParamsV1Input,
	MigrationItemRunStatus,
} from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { runChunkedMigration } from "../../utils/runChunkedMigration";
import { expectMigrationItemRunStatus } from "../batchTestUtils";

const ADDED_WORKFLOWS = 10;

const addWorkflowsOperation = ({
	planId,
	version,
}: {
	planId: string;
	version?: number;
}) => ({
	customer: [
		{
			type: "update_plan" as const,
			plan_filter: {
				plan_id: planId,
				...(version === undefined ? {} : { version }),
			},
			customize: {
				add_items: [
					{ feature_id: TestFeature.Workflows, included: ADDED_WORKFLOWS },
				],
			},
		},
	],
});

const expectWorkflowsAdded = ({
	customer,
	planId,
	added,
}: {
	customer: ApiCustomerV5;
	planId: string;
	added: boolean;
}) => {
	if (!added) {
		expect(customer.balances[TestFeature.Workflows]).toBeUndefined();
		return;
	}
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Workflows,
		remaining: ADDED_WORKFLOWS,
		usage: 0,
		planId,
	});
};

test.concurrent(
	`${chalk.yellowBright("plan filters: broad customer filter + version-targeted operation touches only v2 rows")}`,
	async () => {
		const v1HolderId = "planfilter-op-version-v1";
		const v2HolderId = "planfilter-op-version-v2";
		const plan = products.base({ id: "planfilter-op-version-plan", items: [] });

		const { autumnV1, autumnV2_2, ctx } = await initScenario({
			customerId: v1HolderId,
			setup: [
				s.customer(),
				s.otherCustomers([{ id: v2HolderId }]),
				s.products({ list: [plan] }),
			],
			actions: [s.billing.attach({ productId: plan.id })],
		});

		await autumnV1.products.update(plan.id, { items: [items.dashboard()] });
		await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: v2HolderId,
			plan_id: plan.id,
		});

		const { migration, migrationRunId, result } = await runChunkedMigration({
			ctx,
			migrationClient: autumnV2_2,
			migrationId: "planfilter-op-version-mig",
			filter: { customer: { plan: { plan_id: plan.id } } },
			operations: addWorkflowsOperation({ planId: plan.id, version: 2 }),
			noBillingChanges: true,
		});
		expect(result?.lane).toBe("batch");

		expectWorkflowsAdded({
			customer: await autumnV2_2.customers.get<ApiCustomerV5>(v2HolderId),
			planId: plan.id,
			added: true,
		});
		await expectMigrationItemRunStatus({
			ctx,
			migrationInternalId: migration.internal_id,
			migrationRunId,
			customerId: v2HolderId,
			status: MigrationItemRunStatus.Succeeded,
		});

		expectWorkflowsAdded({
			customer: await autumnV2_2.customers.get<ApiCustomerV5>(v1HolderId),
			planId: plan.id,
			added: false,
		});
		await expectMigrationItemRunStatus({
			ctx,
			migrationInternalId: migration.internal_id,
			migrationRunId,
			customerId: v1HolderId,
			status: MigrationItemRunStatus.Skipped,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("plan filters: version-narrowed customer filter + broad operation claims only v1 holders")}`,
	async () => {
		const v1HolderId = "planfilter-mig-version-v1";
		const v2HolderId = "planfilter-mig-version-v2";
		const plan = products.base({
			id: "planfilter-mig-version-plan",
			items: [],
		});

		const { autumnV1, autumnV2_2, ctx } = await initScenario({
			customerId: v1HolderId,
			setup: [
				s.customer(),
				s.otherCustomers([{ id: v2HolderId }]),
				s.products({ list: [plan] }),
			],
			actions: [s.billing.attach({ productId: plan.id })],
		});

		await autumnV1.products.update(plan.id, { items: [items.dashboard()] });
		await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: v2HolderId,
			plan_id: plan.id,
		});

		const { migration, migrationRunId, result } = await runChunkedMigration({
			ctx,
			migrationClient: autumnV2_2,
			migrationId: "planfilter-mig-version-mig",
			filter: { customer: { plan: { plan_id: plan.id, version: 1 } } },
			operations: addWorkflowsOperation({ planId: plan.id }),
			noBillingChanges: true,
		});
		expect(result?.lane).toBe("batch");

		expectWorkflowsAdded({
			customer: await autumnV2_2.customers.get<ApiCustomerV5>(v1HolderId),
			planId: plan.id,
			added: true,
		});
		await expectMigrationItemRunStatus({
			ctx,
			migrationInternalId: migration.internal_id,
			migrationRunId,
			customerId: v1HolderId,
			status: MigrationItemRunStatus.Succeeded,
		});

		expectWorkflowsAdded({
			customer: await autumnV2_2.customers.get<ApiCustomerV5>(v2HolderId),
			planId: plan.id,
			added: false,
		});
	},
);
