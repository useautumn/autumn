/**
 * In-place catalog edit (disable_version) then batch-migrate attached customers.
 *
 * Dashboard flow: rewrite the live version, keep existing rows on the retired
 * entitlement, then run the auto-draft so customers catch up.
 *
 * Contract:
 *   mixed/replace: 100/mo → 200/mo, used 3 → remaining 197, one messages row,
 *     no leftover 100 row, dashboard survives
 *   delete: drop messages/mo → zero messages rows, dashboard survives
 *   add: keep 100/mo, add words once → original messages row + one words row
 *
 * C14 (catalog already 30, live 10 → remaining 27) lives in
 * batch-replace-item-in-place.test.ts — not duplicated here.
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	MigrationItemRunStatus,
	type UpdatePlanParamsV2Input,
} from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { expectFlagCorrect } from "@tests/integration/utils/expectFlagCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import {
	type PollableExpectParams,
	pollableCustomerExpect,
} from "@tests/utils/pollableCustomerExpect";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { migrationRepo } from "@/internal/migrations/v2/repos/index.js";
import { runMigrationInChunks } from "@/internal/migrations/v2/run/runMigrationInChunks.js";
import { generateId } from "@/utils/genUtils.js";
import {
	expectCustomerEntitlementRowCount,
	expectMigrationItemRunStatus,
	type ScenarioCtx,
} from "../batchTestUtils";
import {
	expectReplacedFeatureRowCorrect,
	setScopedFeatureBalance,
} from "../paidRowTestUtils";
import { expectBatchLane } from "../version-repoint/utils/versionRepointTestUtils";

const MESSAGES_INCLUDED = 100;
const NEW_MESSAGES_INCLUDED = 200;
const CONSUMED = 3;
const WORDS_INCLUDED = 50;

const dashboardAndMessages = [
	itemsV2.dashboard(),
	itemsV2.monthlyMessages(),
] as const;

type InPlaceItems = UpdatePlanParamsV2Input["items"];

const expectBalanceAbsent = pollableCustomerExpect({
	fetchCustomer: ({
		customerId,
		autumn,
	}: PollableExpectParams<ApiCustomerV5> & { featureId: string }) =>
		autumn!.customers.get<ApiCustomerV5>(customerId!),
	assert: ({
		customer,
		featureId,
	}: PollableExpectParams<ApiCustomerV5> & {
		customer: ApiCustomerV5;
		featureId: string;
	}) => {
		expect(customer.balances[featureId]).toBeUndefined();
	},
});

const seedAttachedPlan = async ({
	customerId,
	otherCustomerId,
	planId,
}: {
	customerId: string;
	otherCustomerId: string;
	planId: string;
}) => {
	const plan = products.base({
		id: planId,
		items: [
			items.dashboard(),
			items.monthlyMessages({ includedUsage: MESSAGES_INCLUDED }),
		],
	});

	const scenario = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false }),
			s.otherCustomers([{ id: otherCustomerId }]),
			s.products({ list: [plan] }),
		],
		actions: [
			s.parallel(
				s.billing.attach({ productId: plan.id }),
				s.billing.attach({
					customerId: otherCustomerId,
					productId: plan.id,
				}),
			),
		],
	});

	return { ...scenario, plan, customerIds: [customerId, otherCustomerId] };
};

const updatePlanInPlace = async ({
	autumn,
	planId,
	items: nextItems,
}: {
	autumn: Awaited<ReturnType<typeof initScenario>>["autumnV2_3"];
	planId: string;
	items: InPlaceItems;
}) => {
	const body: UpdatePlanParamsV2Input = {
		plan_id: planId,
		disable_version: true,
		migration: { draft: true },
		items: nextItems,
	};
	const response = (await autumn.post("/plans.update", body)) as {
		migration?: { id: string };
		migrations?: { id: string }[];
	};
	const migrationId = response.migrations?.[0]?.id ?? response.migration?.id;
	if (!migrationId) throw new Error(`expected a catalog draft for ${planId}`);
	return migrationId;
};

const runCatalogDraft = async ({
	ctx,
	migrationId,
}: {
	ctx: ScenarioCtx;
	migrationId: string;
}) => {
	const [migration] = await migrationRepo.get({ ctx, id: migrationId });
	if (!migration) throw new Error(`Migration ${migrationId} not found`);
	const migrationRunId = generateId("mrun");
	const result = await runMigrationInChunks({
		ctx,
		migration,
		migrationRunId,
		dryRun: false,
	});
	return { migration, migrationRunId, result };
};

const expectRowCounts = async ({
	ctx,
	customerIds,
	planId,
	counts,
}: {
	ctx: ScenarioCtx;
	customerIds: string[];
	planId: string;
	counts: Partial<Record<TestFeature, number>>;
}) => {
	for (const customerId of customerIds) {
		for (const [featureId, count] of Object.entries(counts) as [
			TestFeature,
			number,
		][]) {
			await expectCustomerEntitlementRowCount({
				ctx,
				customerId,
				planId,
				featureId,
				count,
			});
		}
	}
};

const expectSucceededRuns = async ({
	ctx,
	migrationInternalId,
	migrationRunId,
	customerIds,
}: {
	ctx: ScenarioCtx;
	migrationInternalId: string;
	migrationRunId: string;
	customerIds: string[];
}) => {
	for (const customerId of customerIds) {
		await expectMigrationItemRunStatus({
			ctx,
			migrationInternalId,
			migrationRunId,
			customerId,
			status: MigrationItemRunStatus.Succeeded,
		});
	}
};

test.concurrent(
	`${chalk.yellowBright("in-place catalog: 100→200 then migrate carries remaining, no duplicate messages")}`,
	async () => {
		const customerId = "batch-inplace-replace";
		const otherCustomerId = "batch-inplace-replace-b";
		const { ctx, autumnV2_3, plan, customerIds } = await seedAttachedPlan({
			customerId,
			otherCustomerId,
			planId: "batch-inplace-replace-plan",
		});

		const beforeByCustomer = new Map(
			await Promise.all(
				customerIds.map(async (id) => {
					const before = await setScopedFeatureBalance({
						ctx,
						customerId: id,
						featureId: TestFeature.Messages,
						balance: MESSAGES_INCLUDED - CONSUMED,
					});
					return [id, before] as const;
				}),
			),
		);

		const migrationId = await updatePlanInPlace({
			autumn: autumnV2_3,
			planId: plan.id,
			items: [
				itemsV2.dashboard(),
				itemsV2.monthlyMessages({ included: NEW_MESSAGES_INCLUDED }),
			],
		});

		await expectRowCounts({
			ctx,
			customerIds,
			planId: plan.id,
			counts: { [TestFeature.Messages]: 1, [TestFeature.Dashboard]: 1 },
		});
		await expectBalanceCorrect({
			customerId,
			autumn: autumnV2_3,
			featureId: TestFeature.Messages,
			remaining: MESSAGES_INCLUDED - CONSUMED,
			usage: CONSUMED,
			granted: MESSAGES_INCLUDED,
			planId: plan.id,
			breakdownCount: 1,
		});

		const { migration, migrationRunId, result } = await runCatalogDraft({
			ctx,
			migrationId,
		});
		expectBatchLane({ result });
		await expectSucceededRuns({
			ctx,
			migrationInternalId: migration.internal_id,
			migrationRunId,
			customerIds,
		});

		const remaining = NEW_MESSAGES_INCLUDED - CONSUMED;
		for (const id of customerIds) {
			const before = beforeByCustomer.get(id);
			if (!before) throw new Error(`missing before-row for ${id}`);
			await expectReplacedFeatureRowCorrect({
				ctx,
				customerId: id,
				featureId: TestFeature.Messages,
				beforeRowId: before.id,
				beforeEntitlementId: before.entitlement_id,
				balance: remaining,
			});
			await expectCustomerProducts({
				customerId: id,
				autumn: autumnV2_3,
				active: [plan.id],
			});
			await expectBalanceCorrect({
				customerId: id,
				autumn: autumnV2_3,
				featureId: TestFeature.Messages,
				remaining,
				usage: CONSUMED,
				granted: NEW_MESSAGES_INCLUDED,
				planId: plan.id,
				breakdownCount: 1,
			});
			const customer = await autumnV2_3.customers.get<ApiCustomerV5>(id);
			expectFlagCorrect({
				customer,
				featureId: TestFeature.Dashboard,
				planId: plan.id,
			});
		}
		await expectRowCounts({
			ctx,
			customerIds,
			planId: plan.id,
			counts: { [TestFeature.Messages]: 1, [TestFeature.Dashboard]: 1 },
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("in-place catalog: delete messages then migrate drops the row, no leftover")}`,
	async () => {
		const customerId = "batch-inplace-delete";
		const otherCustomerId = "batch-inplace-delete-b";
		const { ctx, autumnV2_3, plan, customerIds } = await seedAttachedPlan({
			customerId,
			otherCustomerId,
			planId: "batch-inplace-delete-plan",
		});

		const migrationId = await updatePlanInPlace({
			autumn: autumnV2_3,
			planId: plan.id,
			items: [itemsV2.dashboard()],
		});

		await expectRowCounts({
			ctx,
			customerIds,
			planId: plan.id,
			counts: { [TestFeature.Messages]: 1, [TestFeature.Dashboard]: 1 },
		});

		const { migration, migrationRunId, result } = await runCatalogDraft({
			ctx,
			migrationId,
		});
		expectBatchLane({ result });
		await expectSucceededRuns({
			ctx,
			migrationInternalId: migration.internal_id,
			migrationRunId,
			customerIds,
		});

		await expectRowCounts({
			ctx,
			customerIds,
			planId: plan.id,
			counts: { [TestFeature.Messages]: 0, [TestFeature.Dashboard]: 1 },
		});
		for (const id of customerIds) {
			await expectCustomerProducts({
				customerId: id,
				autumn: autumnV2_3,
				active: [plan.id],
			});
			await expectBalanceAbsent({
				customerId: id,
				autumn: autumnV2_3,
				featureId: TestFeature.Messages,
			});
			const customer = await autumnV2_3.customers.get<ApiCustomerV5>(id);
			expectFlagCorrect({
				customer,
				featureId: TestFeature.Dashboard,
				planId: plan.id,
			});
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("in-place catalog: add words then migrate keeps 100/mo and adds words once")}`,
	async () => {
		const customerId = "batch-inplace-add";
		const otherCustomerId = "batch-inplace-add-b";
		const { ctx, autumnV2_3, plan, customerIds } = await seedAttachedPlan({
			customerId,
			otherCustomerId,
			planId: "batch-inplace-add-plan",
		});

		const migrationId = await updatePlanInPlace({
			autumn: autumnV2_3,
			planId: plan.id,
			items: [
				...dashboardAndMessages,
				itemsV2.monthlyWords({ included: WORDS_INCLUDED }),
			],
		});

		await expectRowCounts({
			ctx,
			customerIds,
			planId: plan.id,
			counts: {
				[TestFeature.Messages]: 1,
				[TestFeature.Dashboard]: 1,
				[TestFeature.Words]: 0,
			},
		});

		const { migration, migrationRunId, result } = await runCatalogDraft({
			ctx,
			migrationId,
		});
		expectBatchLane({ result });
		await expectSucceededRuns({
			ctx,
			migrationInternalId: migration.internal_id,
			migrationRunId,
			customerIds,
		});

		await expectRowCounts({
			ctx,
			customerIds,
			planId: plan.id,
			counts: {
				[TestFeature.Messages]: 1,
				[TestFeature.Dashboard]: 1,
				[TestFeature.Words]: 1,
			},
		});
		for (const id of customerIds) {
			await expectCustomerProducts({
				customerId: id,
				autumn: autumnV2_3,
				active: [plan.id],
			});
			await expectBalanceCorrect({
				customerId: id,
				autumn: autumnV2_3,
				featureId: TestFeature.Messages,
				remaining: MESSAGES_INCLUDED,
				usage: 0,
				granted: MESSAGES_INCLUDED,
				planId: plan.id,
				breakdownCount: 1,
			});
			await expectBalanceCorrect({
				customerId: id,
				autumn: autumnV2_3,
				featureId: TestFeature.Words,
				remaining: WORDS_INCLUDED,
				usage: 0,
				granted: WORDS_INCLUDED,
				planId: plan.id,
				breakdownCount: 1,
			});
			const customer = await autumnV2_3.customers.get<ApiCustomerV5>(id);
			expectFlagCorrect({
				customer,
				featureId: TestFeature.Dashboard,
				planId: plan.id,
			});
		}
	},
);
