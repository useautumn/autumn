import { beforeAll, expect, test } from "bun:test";
import {
	customerEntitlements,
	customerProducts,
	customers,
	entitlements,
	features,
	MigrationItemRunStatus,
} from "@autumn/shared";
import { TestFeature, getFeatures } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2.js";
import { products } from "@tests/utils/fixtures/products.js";
import baseCtx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { and, eq } from "drizzle-orm";
import { CusService } from "@/internal/customers/CusService.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import {
	migrationItemRunRepo,
	migrationRunRepo,
} from "@/internal/migrations/v2/repos/index.js";
import { waitForMigrationResult } from "../../utils/runUpdatePlanMigration.js";

beforeAll(async () => {
	const desiredFeatures = Object.values(getFeatures({ orgId: baseCtx.org.id }));
	const existingFeatures = await FeatureService.list({
		db: baseCtx.db,
		orgId: baseCtx.org.id,
		env: baseCtx.env,
	});
	const existingFeatureIds = new Set(
		existingFeatures.map((feature) => feature.id),
	);
	const missingFeatures = desiredFeatures.filter(
		(feature) => !existingFeatureIds.has(feature.id),
	);

	if (missingFeatures.length > 0) {
		await FeatureService.insert({
			db: baseCtx.db,
			data: missingFeatures,
			logger: console,
		});
	}

	baseCtx.features = await FeatureService.list({
		db: baseCtx.db,
		orgId: baseCtx.org.id,
		env: baseCtx.env,
	});
});

const getInternalCustomerId = async ({
	ctx,
	customerId,
}: {
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
	customerId: string;
}) => {
	const customer = await CusService.get({
		db: ctx.db,
		idOrInternalId: customerId,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	if (!customer) throw new Error(`Expected customer ${customerId}`);
	return customer.internal_id;
};

const waitForRunCompleted = async ({
	ctx,
	runId,
}: {
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
	runId: string;
}) =>
	waitForMigrationResult({
		timeoutMs: 60_000,
		pollIntervalMs: 1_000,
		waitFor: async () => {
			const [run] = await migrationRunRepo.list({ ctx, internalId: runId });
			if (!run) throw new Error("Run not found");
			if (run.status === "failed") {
				throw new Error(`Run failed: ${run.error_message}`);
			}
			if (run.status !== "succeeded") {
				throw new Error(`Run still ${run.status}`);
			}
		},
	});

const getActiveFeatureIds = async ({
	ctx,
	customerId,
	planId,
}: {
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
	customerId: string;
	planId: string;
}) => {
	const rows = await ctx.db
		.select({ featureId: features.id })
		.from(customerProducts)
		.innerJoin(
			customers,
			eq(customerProducts.internal_customer_id, customers.internal_id),
		)
		.innerJoin(
			customerEntitlements,
			eq(customerEntitlements.customer_product_id, customerProducts.id),
		)
		.innerJoin(
			entitlements,
			eq(customerEntitlements.entitlement_id, entitlements.id),
		)
		.innerJoin(features, eq(entitlements.internal_feature_id, features.internal_id))
		.where(
			and(
				eq(customers.org_id, ctx.org.id),
				eq(customers.env, ctx.env),
				eq(customers.id, customerId),
				eq(customerProducts.product_id, planId),
			),
		);

	return rows.map((row) => row.featureId);
};

test(`${chalk.yellowBright("update_plan custom:false: broad filter includes custom customers but skips custom customer-products")}`, async () => {
	const suffix = Math.random().toString(36).slice(2, 9);
	const customOnlyCustomerId = `custom-filter-only-${suffix}`;
	const mixedCustomerId = `custom-filter-mixed-${suffix}`;
	const customPlan = products.base({
		id: `custom-filter-custom-${suffix}`,
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const regularPlan = products.base({
		id: `custom-filter-regular-${suffix}`,
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { autumnV1, autumnV2_2, ctx } = await initScenario({
		customerId: customOnlyCustomerId,
		setup: [
			s.customer({}),
			s.otherCustomers([{ id: mixedCustomerId }]),
			s.products({ list: [customPlan, regularPlan], prefix: "" }),
		],
		actions: [],
	});
	await autumnV1.billing.attach({
		customer_id: customOnlyCustomerId,
		product_id: customPlan.id,
		items: [items.monthlyMessages({ includedUsage: 250 })],
	});
	await autumnV1.billing.attach({
		customer_id: mixedCustomerId,
		product_id: customPlan.id,
		items: [items.monthlyMessages({ includedUsage: 300 })],
	});
	await autumnV1.billing.attach({
		customer_id: mixedCustomerId,
		product_id: regularPlan.id,
	});
	const customOnlyInternalId = await getInternalCustomerId({
		ctx,
		customerId: customOnlyCustomerId,
	});
	const mixedInternalId = await getInternalCustomerId({
		ctx,
		customerId: mixedCustomerId,
	});
	const topLevelFilter = {
		plan: {
			plan_id: { $in: [customPlan.id, regularPlan.id] },
		},
	};

	const migration = await autumnV2_2.migrationsV2.deleteAndCreate({
		id: `custom-filter-migration-${suffix}`,
		filter: {
			customer: topLevelFilter,
		},
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: {
						plan_id: { $in: [customPlan.id, regularPlan.id] },
						custom: false,
					},
					customize: { add_items: [itemsV2.monthlyWords()] },
				},
			],
		},
		no_billing_changes: true,
	});

	const run = await autumnV2_2.migrationsV2.run({
		id: migration.id,
		dry_run: false,
	});
	await waitForRunCompleted({ ctx, runId: run.run_id });

	const customOnlyRun = await migrationItemRunRepo.getCustomer({
		ctx,
		migrationInternalId: migration.internal_id,
		internalCustomerId: customOnlyInternalId,
	});
	const mixedRun = await migrationItemRunRepo.getCustomer({
		ctx,
		migrationInternalId: migration.internal_id,
		internalCustomerId: mixedInternalId,
	});
	expect(customOnlyRun).toMatchObject({
		status: MigrationItemRunStatus.Skipped,
	});
	expect(mixedRun).toMatchObject({
		status: MigrationItemRunStatus.Succeeded,
	});

	expect(
		await getActiveFeatureIds({
			ctx,
			customerId: customOnlyCustomerId,
			planId: customPlan.id,
		}),
	).not.toContain(TestFeature.Words);
	expect(
		await getActiveFeatureIds({
			ctx,
			customerId: mixedCustomerId,
			planId: customPlan.id,
		}),
	).not.toContain(TestFeature.Words);
	expect(
		await getActiveFeatureIds({
			ctx,
			customerId: mixedCustomerId,
			planId: regularPlan.id,
		}),
	).toContain(TestFeature.Words);
});
