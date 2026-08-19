/**
 * Feature ops inside one op type run concurrently (cap 3). These scenarios
 * push past the cap so some ops queue behind others, and assert nothing
 * bleeds between features:
 *   - Five in-place replaces carry each feature's own consumption across —
 *     distinct includes and consumption per feature catch any cross-feature
 *     mixup from concurrent execution.
 *   - Succeeded/skipped marks stay honest when ops complete out of order: a
 *     customized (out-of-scope) customer is skipped and untouched while plain
 *     customers converge.
 */
import { expect, test } from "bun:test";
import {
	customerEntitlements,
	MigrationItemRunStatus,
	ResetInterval,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem";
import { runChunkedMigration } from "../../utils/runChunkedMigration";
import {
	expectCustomerEntitlementRowCount,
	expectMigrationItemRunStatus,
	type ScenarioCtx,
} from "../batchTestUtils";
import { readScopedFeatureRow } from "../paidRowTestUtils";

/** Distinct include/consumption per feature so a concurrent op writing the
 * wrong feature's numbers fails an assertion instead of passing by luck. */
const REPLACED_FEATURES = [
	{ featureId: TestFeature.Messages, included: 100, consumed: 10 },
	{ featureId: TestFeature.Words, included: 110, consumed: 20 },
	{ featureId: TestFeature.Credits, included: 120, consumed: 30 },
	{ featureId: TestFeature.Credits2, included: 130, consumed: 40 },
	{ featureId: TestFeature.Credits3, included: 140, consumed: 50 },
] as const;
const INCLUDED_BUMP = 100;

const toPlanItems = () =>
	REPLACED_FEATURES.map(({ featureId, included }) =>
		constructFeatureItem({ featureId, includedUsage: included }),
	);

const toReplaceCustomize = () => ({
	add_items: REPLACED_FEATURES.map(({ featureId, included }) => ({
		feature_id: featureId,
		included: included + INCLUDED_BUMP,
		reset: { interval: ResetInterval.Month },
	})),
	remove_items: REPLACED_FEATURES.map(({ featureId }) => ({
		feature_id: featureId,
	})),
});

const consumeBalances = async ({
	ctx,
	customerId,
}: {
	ctx: ScenarioCtx;
	customerId: string;
}) => {
	for (const { featureId, included, consumed } of REPLACED_FEATURES) {
		const row = await readScopedFeatureRow({ ctx, customerId, featureId });
		await ctx.db
			.update(customerEntitlements)
			.set({ balance: included - consumed })
			.where(eq(customerEntitlements.id, row.id));
	}
};

test(`${chalk.yellowBright("batch migration: five concurrent replaces carry each feature's own balance")}`, async () => {
	const customerId = "batch-parallel-replace-customer";
	const plan = products.base({
		id: "batch-parallel-replace-plan",
		items: toPlanItems(),
	});
	const { ctx, autumnV2_2 } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
		actions: [s.attach({ productId: plan.id })],
	});

	await consumeBalances({ ctx, customerId });
	const beforeRows = new Map(
		await Promise.all(
			REPLACED_FEATURES.map(
				async ({ featureId }) =>
					[
						featureId,
						await readScopedFeatureRow({ ctx, customerId, featureId }),
					] as const,
			),
		),
	);

	const { result, migration, migrationRunId } = await runChunkedMigration({
		ctx,
		migrationClient: autumnV2_2,
		migrationId: "batch-parallel-replace-migration",
		filter: { customer: { plan: { plan_id: plan.id, custom: false } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: plan.id, custom: false },
					customize: toReplaceCustomize(),
				},
			],
		},
		noBillingChanges: true,
	});

	expect({
		lane: result?.lane,
		rejections: result?.rejections ?? [],
	}).toEqual({ lane: "batch", rejections: [] });
	await expectMigrationItemRunStatus({
		ctx,
		migrationInternalId: migration.internal_id,
		migrationRunId,
		customerId,
		status: MigrationItemRunStatus.Succeeded,
	});

	for (const { featureId, included, consumed } of REPLACED_FEATURES) {
		const before = beforeRows.get(featureId);
		if (!before) throw new Error(`Expected a before-row for ${featureId}`);
		const after = await readScopedFeatureRow({ ctx, customerId, featureId });

		// In-place replace: same row, new definition, own consumption carried.
		expect(after.id).toBe(before.id);
		expect(after.entitlement_id).not.toBe(before.entitlement_id);
		expect(after.balance).toBe(included + INCLUDED_BUMP - consumed);
		await expectCustomerEntitlementRowCount({
			ctx,
			customerId,
			planId: plan.id,
			featureId,
			count: 1,
		});
	}
});

test(`${chalk.yellowBright("batch migration: concurrent ops keep succeeded and skipped marks honest")}`, async () => {
	const plainIds = ["batch-parallel-marks-first", "batch-parallel-marks-second"];
	const customId = "batch-parallel-marks-custom";
	const [firstId, secondId] = plainIds;
	const customMessages = 999;
	const plan = products.base({
		id: "batch-parallel-marks-plan",
		items: toPlanItems(),
	});

	const { ctx, autumnV2_2 } = await initScenario({
		customerId: firstId,
		setup: [
			s.customer({ testClock: false }),
			s.otherCustomers([{ id: secondId }, { id: customId }]),
			s.products({ list: [plan] }),
		],
		actions: [
			s.parallel(
				s.billing.attach({ productId: plan.id }),
				s.billing.attach({ customerId: secondId, productId: plan.id }),
				s.billing.attach({
					customerId: customId,
					productId: plan.id,
					items: [
						constructFeatureItem({
							featureId: TestFeature.Messages,
							includedUsage: customMessages,
						}),
					],
				}),
			),
		],
	});

	const customBefore = await readScopedFeatureRow({
		ctx,
		customerId: customId,
		featureId: TestFeature.Messages,
	});

	const { result, migration, migrationRunId } = await runChunkedMigration({
		ctx,
		migrationClient: autumnV2_2,
		migrationId: "batch-parallel-marks-migration",
		filter: { customer: { plan: { plan_id: plan.id } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: plan.id, custom: false },
					customize: toReplaceCustomize(),
				},
			],
		},
		noBillingChanges: true,
	});

	expect(result?.lane).toBe("batch");

	for (const customerId of plainIds) {
		await expectMigrationItemRunStatus({
			ctx,
			migrationInternalId: migration.internal_id,
			migrationRunId,
			customerId,
			status: MigrationItemRunStatus.Succeeded,
		});
		for (const { featureId, included } of REPLACED_FEATURES) {
			const row = await readScopedFeatureRow({ ctx, customerId, featureId });
			expect(row.balance).toBe(included + INCLUDED_BUMP);
		}
	}

	// The customized customer is out of scope for every concurrent op: no op
	// changed them, so out-of-order completions must still mark them skipped.
	await expectMigrationItemRunStatus({
		ctx,
		migrationInternalId: migration.internal_id,
		migrationRunId,
		customerId: customId,
		status: MigrationItemRunStatus.Skipped,
	});
	const customAfter = await readScopedFeatureRow({
		ctx,
		customerId: customId,
		featureId: TestFeature.Messages,
	});
	expect(customAfter.entitlement_id).toBe(customBefore.entitlement_id);
	expect(customAfter.balance).toBe(customMessages);
});
