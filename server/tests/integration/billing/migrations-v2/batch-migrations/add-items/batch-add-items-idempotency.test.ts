import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	type CreatePlanItemParamsV1,
	MigrationItemRunStatus,
} from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { expectFlagCorrect } from "@tests/integration/utils/expectFlagCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { runChunkedMigration } from "../../utils/runChunkedMigration";
import {
	expectCustomerEntitlementRowCount,
	expectMigrationItemRunStatus,
} from "../batchTestUtils";

const ADDED_MESSAGES = 100;
const TRACKED_MESSAGES = 30;

const addItemsOperation = ({
	planId,
	addItems,
}: {
	planId: string;
	addItems: CreatePlanItemParamsV1[];
}) => ({
	customer: [
		{
			type: "update_plan" as const,
			plan_filter: { plan_id: planId },
			customize: { add_items: addItems },
		},
	],
});

test.concurrent(
	`${chalk.yellowBright("batch add_items idempotency: replaying the same add inserts nothing")}`,
	async () => {
		const trackedId = "batch-add-idem-tracked";
		const untouchedId = "batch-add-idem-untouched";
		const freePlan = products.base({ id: "batch-add-idem-free", items: [] });
		const addItems = [
			itemsV2.dashboard(),
			itemsV2.monthlyMessages({ included: ADDED_MESSAGES }),
		];

		const { autumnV2_2, ctx } = await initScenario({
			customerId: trackedId,
			setup: [
				s.customer(),
				s.otherCustomers([{ id: untouchedId }]),
				s.products({ list: [freePlan] }),
			],
			actions: [
				s.parallel(
					s.billing.attach({ productId: freePlan.id }),
					s.billing.attach({ customerId: untouchedId, productId: freePlan.id }),
				),
			],
		});

		const runAddItems = ({ migrationId }: { migrationId: string }) =>
			runChunkedMigration({
				ctx,
				migrationClient: autumnV2_2,
				migrationId,
				filter: { customer: { plan: { plan_id: freePlan.id } } },
				operations: addItemsOperation({ planId: freePlan.id, addItems }),
				noBillingChanges: true,
			});

		const expectSingleRows = async ({ customerId }: { customerId: string }) => {
			for (const featureId of [TestFeature.Messages, TestFeature.Dashboard]) {
				await expectCustomerEntitlementRowCount({
					ctx,
					customerId,
					planId: freePlan.id,
					featureId,
					count: 1,
				});
			}
		};

		const firstRun = await runAddItems({ migrationId: "batch-add-idem-mig-a" });
		expect(firstRun.result?.lane).toBe("batch");

		for (const customerId of [trackedId, untouchedId]) {
			const customer =
				await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
			expectBalanceCorrect({
				customer,
				featureId: TestFeature.Messages,
				granted: ADDED_MESSAGES,
				remaining: ADDED_MESSAGES,
				usage: 0,
				planId: freePlan.id,
				breakdownCount: 1,
			});
			expectFlagCorrect({
				customer,
				featureId: TestFeature.Dashboard,
				planId: freePlan.id,
			});
			await expectSingleRows({ customerId });
		}

		await autumnV2_2.track(
			{
				customer_id: trackedId,
				feature_id: TestFeature.Messages,
				value: TRACKED_MESSAGES,
			},
			{ timeout: 3_000 },
		);

		const replayRun = await runAddItems({
			migrationId: "batch-add-idem-mig-b",
		});
		expect(replayRun.result?.lane).toBe("batch");

		const trackedCustomer =
			await autumnV2_2.customers.get<ApiCustomerV5>(trackedId);
		expectBalanceCorrect({
			customer: trackedCustomer,
			featureId: TestFeature.Messages,
			granted: ADDED_MESSAGES,
			remaining: ADDED_MESSAGES - TRACKED_MESSAGES,
			usage: TRACKED_MESSAGES,
			planId: freePlan.id,
			breakdownCount: 1,
		});
		expectFlagCorrect({
			customer: trackedCustomer,
			featureId: TestFeature.Dashboard,
			planId: freePlan.id,
		});

		const untouchedCustomer =
			await autumnV2_2.customers.get<ApiCustomerV5>(untouchedId);
		expectBalanceCorrect({
			customer: untouchedCustomer,
			featureId: TestFeature.Messages,
			granted: ADDED_MESSAGES,
			remaining: ADDED_MESSAGES,
			usage: 0,
			planId: freePlan.id,
			breakdownCount: 1,
		});

		for (const customerId of [trackedId, untouchedId]) {
			await expectSingleRows({ customerId });
			await expectMigrationItemRunStatus({
				ctx,
				migrationInternalId: replayRun.migration.internal_id,
				migrationRunId: replayRun.migrationRunId,
				customerId,
				status: MigrationItemRunStatus.Skipped,
			});
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("batch add_items idempotency: customized plan keeps a single messages balance")}`,
	async () => {
		const plainId = "batch-add-idem-plain";
		const customizedId = "batch-add-idem-customized";
		const catalogMessages = 50;
		const customizedMessages = 100;
		const basePrice = items.monthlyPrice({ price: 20 });
		const pro = products.pro({
			id: "batch-add-idem-pro",
			items: [items.monthlyMessages({ includedUsage: catalogMessages })],
		});

		const { autumnV2_2, ctx } = await initScenario({
			customerId: plainId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.otherCustomers([{ id: customizedId, paymentMethod: "success" }]),
				s.products({ list: [pro] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.billing.attach({
					customerId: customizedId,
					productId: pro.id,
					items: [
						basePrice,
						items.monthlyMessages({ includedUsage: customizedMessages }),
					],
				}),
			],
		});

		const { migration, migrationRunId, result } = await runChunkedMigration({
			ctx,
			migrationClient: autumnV2_2,
			migrationId: "batch-add-idem-pro-mig",
			filter: { customer: { plan: { plan_id: pro.id } } },
			operations: addItemsOperation({
				planId: pro.id,
				addItems: [itemsV2.monthlyMessages({ included: 200 })],
			}),
			noBillingChanges: true,
		});
		expect(result?.lane).toBe("batch");

		for (const [customerId, expectedMessages] of [
			[plainId, catalogMessages],
			[customizedId, customizedMessages],
		] as const) {
			const customer =
				await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
			expectBalanceCorrect({
				customer,
				featureId: TestFeature.Messages,
				granted: expectedMessages,
				remaining: expectedMessages,
				usage: 0,
				planId: pro.id,
				breakdownCount: 1,
			});
			await expectCustomerEntitlementRowCount({
				ctx,
				customerId,
				planId: pro.id,
				featureId: TestFeature.Messages,
				count: 1,
			});
			await expectMigrationItemRunStatus({
				ctx,
				migrationInternalId: migration.internal_id,
				migrationRunId,
				customerId,
				status: MigrationItemRunStatus.Skipped,
			});
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("batch add_items: catalog 10 msgs/mo is not overwritten by add 20")}`,
	async () => {
		const customerId = "batch-add-keep-10";
		const catalogMessages = 10;
		const addedMessages = 20;
		const plan = products.base({
			id: "batch-add-keep-10-plan",
			items: [items.monthlyMessages({ includedUsage: catalogMessages })],
		});

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [s.customer(), s.products({ list: [plan] })],
			actions: [s.billing.attach({ productId: plan.id })],
		});

		const { migration, migrationRunId, result } = await runChunkedMigration({
			ctx,
			migrationClient: autumnV2_3,
			migrationId: "batch-add-keep-10-mig",
			filter: { customer: { plan: { plan_id: plan.id } } },
			operations: addItemsOperation({
				planId: plan.id,
				addItems: [itemsV2.monthlyMessages({ included: addedMessages })],
			}),
			noBillingChanges: true,
		});
		expect(result?.lane).toBe("batch");

		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer,
			featureId: TestFeature.Messages,
			granted: catalogMessages,
			remaining: catalogMessages,
			usage: 0,
			planId: plan.id,
			breakdownCount: 1,
		});
		await expectCustomerEntitlementRowCount({
			ctx,
			customerId,
			planId: plan.id,
			featureId: TestFeature.Messages,
			count: 1,
		});
		await expectMigrationItemRunStatus({
			ctx,
			migrationInternalId: migration.internal_id,
			migrationRunId,
			customerId,
			status: MigrationItemRunStatus.Skipped,
		});
	},
);
