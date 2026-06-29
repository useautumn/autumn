import { expect, test } from "bun:test";
import {
	type ApiPlanV1,
	ApiVersion,
	customerProducts,
	customers,
	ErrCode,
	ResetInterval,
	type UpdatePlanParamsV2Input,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { and, eq } from "drizzle-orm";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli.js";
import { migrationRepo } from "@/internal/migrations/v2/repos/index.js";
import { expectMigrationDrafts } from "./expectMigrationDrafts.js";

type RpcUpdate = Omit<UpdatePlanParamsV2Input, "plan_id">;

const catchErr = async (fn: () => Promise<unknown>) => {
	try {
		await fn();
		return null;
	} catch (error: unknown) {
		return error as { code?: string; statusCode?: number };
	}
};

const messagesItem = (included: number) => ({
	feature_id: TestFeature.Messages,
	included,
	unlimited: false,
	reset: { interval: ResetInterval.Month },
});

const messagesDiff = (included: number) => ({
	remove_items: [
		{
			feature_id: TestFeature.Messages,
			interval: ResetInterval.Month,
			interval_count: 1,
		},
	],
	add_items: [messagesItem(included)],
});

const getCustomerProductCustomState = async ({
	ctx,
	customerId,
	planId,
}: {
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
	customerId: string;
	planId: string;
}) => {
	const [row] = await ctx.db
		.select({ isCustom: customerProducts.is_custom })
		.from(customerProducts)
		.innerJoin(
			customers,
			eq(customerProducts.internal_customer_id, customers.internal_id),
		)
		.where(
			and(
				eq(customers.org_id, ctx.org.id),
				eq(customers.env, ctx.env),
				eq(customers.id, customerId),
				eq(customerProducts.product_id, planId),
			),
		);

	return row?.isCustom;
};

const findUpdatePlanOpByIncluded = ({
	included,
	migrations,
}: {
	included: number;
	migrations: Awaited<ReturnType<typeof migrationRepo.get>>;
}) => {
	for (const operation of migrations.flatMap(
		(migration) => migration.operations?.customer ?? [],
	)) {
		if (operation.type !== "update_plan") continue;
		if (
			operation.customize?.add_items?.some(
				(item) =>
					item.feature_id === TestFeature.Messages &&
					item.included === included,
			)
		) {
			return operation;
		}
	}
};

const setupPlan = async ({
	id,
	variantId,
}: {
	id: string;
	variantId?: string;
}) => {
	const customerId = `${id}_customer`;
	const variantCustomerId = variantId ? `${variantId}_customer` : undefined;
	const base = products.base({
		id,
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const scenario = await initScenario({
		customerId,
		setup: [
			s.customer({}),
			...(variantCustomerId
				? [s.otherCustomers([{ id: variantCustomerId }])]
				: []),
			s.products({ list: [base], prefix: "" }),
		],
		actions: [],
	});
	const rpc = new AutumnRpcCli({
		secretKey: scenario.ctx.orgSecretKey,
		version: ApiVersion.V2_1,
	});

	if (variantId && variantCustomerId) {
		await scenario.autumnV2_3.plans.createVariant({
			base_plan_id: id,
			variant_plan_id: variantId,
			name: "Annual",
		});
	}

	await scenario.autumnV2_2.billing.attach({
		customer_id: customerId,
		plan_id: id,
	});

	if (variantId && variantCustomerId) {
		await scenario.autumnV2_2.billing.attach({
			customer_id: variantCustomerId,
			plan_id: variantId,
		});
	}

	return { ...scenario, rpc };
};

test(`${chalk.yellowBright("migration drafts: plans.update all_versions creates one diff op")}`, async () => {
	const planId = `draft_plan_all_${Math.random().toString(36).slice(2, 9)}`;
	const { ctx, rpc } = await setupPlan({ id: planId });

	await rpc.plans.update<ApiPlanV1, RpcUpdate>(planId, {
		items: [messagesItem(200)],
		force_version: true,
	});
	await rpc.plans.update<ApiPlanV1, RpcUpdate>(planId, {
		items: [messagesItem(500)],
		all_versions: true,
		migration: { draft: true },
	});

	expectMigrationDrafts({
		migrations: await migrationRepo.get({ ctx }),
		expected: [
			{
				planIds: [planId],
				filter: { customer: { plan: { plan_id: planId, custom: false } } },
				noBillingChanges: true,
				operation: {
					type: "update_plan",
					plan_filter: { plan_id: planId },
					customize: messagesDiff(500),
				},
			},
		],
	});
});

test(`${chalk.yellowBright("migration drafts: catalog.update all_versions base+variant creates one diff op")}`, async () => {
	const suffix = Math.random().toString(36).slice(2, 9);
	const planId = `draft_catalog_all_${suffix}`;
	const variantId = `${planId}_annual`;
	const { autumnV2_2, ctx } = await setupPlan({ id: planId, variantId });

	await autumnV2_2.catalog.update({
		plans: [
			{
				plan_id: planId,
				name: "Base",
				items: [messagesItem(500)],
				update_variant_ids: [variantId],
				all_versions: true,
				migration: { draft: true },
			},
		],
	});

	expectMigrationDrafts({
		migrations: await migrationRepo.get({ ctx }),
		expected: [
			{
				planIds: [planId, variantId],
				filter: {
					customer: {
						plan: {
							plan_id: { $in: [planId, variantId] },
							custom: false,
						},
					},
				},
				noBillingChanges: true,
				operation: {
					type: "update_plan",
					plan_filter: {
						plan_id: { $in: [planId, variantId] },
					},
					customize: messagesDiff(500),
				},
			},
		],
	});
});

test(`${chalk.yellowBright("migration drafts: variant custom plans follow include_custom")}`, async () => {
	const suffix = Math.random().toString(36).slice(2, 9);
	const planId = `draft_variant_custom_${suffix}`;
	const variantId = `${planId}_annual`;
	const baseCustomerId = `${planId}_base_customer`;
	const customVariantCustomerId = `${planId}_custom_variant_customer`;
	const base = products.base({
		id: planId,
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { autumnV1, autumnV2_2, autumnV2_3, ctx } = await initScenario({
		customerId: baseCustomerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.otherCustomers([
				{ id: customVariantCustomerId, paymentMethod: "success" },
			]),
			s.products({ list: [base], prefix: "" }),
		],
		actions: [],
	});
	await autumnV2_3.plans.createVariant({
		base_plan_id: planId,
		variant_plan_id: variantId,
		name: "Annual",
	});
	await autumnV2_2.billing.attach({
		customer_id: baseCustomerId,
		plan_id: planId,
	});
	await autumnV1.billing.attach({
		customer_id: customVariantCustomerId,
		product_id: variantId,
		items: [items.monthlyMessages({ includedUsage: 250 })],
	});

	expect(
		await getCustomerProductCustomState({
			ctx,
			customerId: customVariantCustomerId,
			planId: variantId,
		}),
	).toBe(true);

	await autumnV2_2.catalog.update({
		plans: [
			{
				plan_id: planId,
				name: "Base",
				items: [messagesItem(500)],
				update_variant_ids: [variantId],
				disable_version: true,
				migration: { draft: true },
			},
		],
	});
	const excludeCustomMigrations = await migrationRepo.get({ ctx });
	const excludeCustomOp = findUpdatePlanOpByIncluded({
		included: 500,
		migrations: excludeCustomMigrations,
	});
	const excludeCustomMigration = excludeCustomMigrations.find((migration) =>
		migration.operations?.customer?.includes(excludeCustomOp!),
	);
	expect(excludeCustomMigration?.filter).toEqual({
		customer: {
			plan: {
				plan_id: { $in: [planId, variantId] },
				version: 1,
				custom: false,
			},
		},
	});
	expect(excludeCustomOp?.plan_filter).toEqual({
		plan_id: { $in: [planId, variantId] },
		version: 1,
	});

	await autumnV2_2.catalog.update({
		plans: [
			{
				plan_id: planId,
				name: "Base",
				items: [messagesItem(700)],
				update_variant_ids: [variantId],
				disable_version: true,
				migration: { draft: true, include_custom: true },
			},
		],
	});
	const includeCustomMigrations = await migrationRepo.get({ ctx });
	const includeCustomOp = findUpdatePlanOpByIncluded({
		included: 700,
		migrations: includeCustomMigrations,
	});
	const includeCustomMigration = includeCustomMigrations.find((migration) =>
		migration.operations?.customer?.includes(includeCustomOp!),
	);
	expect(includeCustomMigration?.filter).toEqual({
		customer: {
			plan: {
				plan_id: { $in: [planId, variantId] },
				version: 1,
			},
		},
	});
	expect(includeCustomOp?.plan_filter).toEqual({
		plan_id: { $in: [planId, variantId] },
		version: 1,
	});
});

test(`${chalk.yellowBright("migration drafts: catalog.update current version creates one version-filtered diff op")}`, async () => {
	const planId = `draft_catalog_current_${Math.random().toString(36).slice(2, 9)}`;
	const { autumnV2_2, ctx } = await setupPlan({ id: planId });

	await autumnV2_2.catalog.update({
		plans: [
			{
				plan_id: planId,
				name: "Base",
				items: [messagesItem(500)],
				disable_version: true,
				migration: { draft: true },
			},
		],
	});

	expectMigrationDrafts({
		migrations: await migrationRepo.get({ ctx }),
		expected: [
			{
				planIds: [planId],
				filter: {
					customer: { plan: { plan_id: planId, version: 1, custom: false } },
				},
				noBillingChanges: true,
				operation: {
					type: "update_plan",
					plan_filter: { plan_id: planId, version: 1 },
					customize: messagesDiff(500),
				},
			},
		],
	});
});

test(`${chalk.yellowBright("migration drafts: plans.update current base+variant creates one version-filtered diff op")}`, async () => {
	const suffix = Math.random().toString(36).slice(2, 9);
	const planId = `draft_plan_current_${suffix}`;
	const variantId = `${planId}_annual`;
	const { ctx, rpc } = await setupPlan({ id: planId, variantId });

	await rpc.plans.update<ApiPlanV1, RpcUpdate>(planId, {
		items: [messagesItem(500)],
		update_variant_ids: [variantId],
		disable_version: true,
		migration: { draft: true },
	});

	expectMigrationDrafts({
		migrations: await migrationRepo.get({ ctx }),
		expected: [
			{
				planIds: [planId, variantId],
				filter: {
					customer: {
						plan: {
							plan_id: { $in: [planId, variantId] },
							version: 1,
							custom: false,
						},
					},
				},
				noBillingChanges: true,
				operation: {
					type: "update_plan",
					plan_filter: {
						plan_id: { $in: [planId, variantId] },
						version: 1,
					},
					customize: messagesDiff(500),
				},
			},
		],
	});
});

test(`${chalk.yellowBright("migration drafts: direct variant update migration is blocked")}`, async () => {
	const suffix = Math.random().toString(36).slice(2, 9);
	const planId = `draft_variant_price_${suffix}`;
	const variantId = `${planId}_annual`;
	const { autumnV2_2 } = await setupPlan({ id: planId, variantId });

	const error = await catchErr(() =>
		autumnV2_2.catalog.update({
			plans: [
				{
					plan_id: planId,
					name: "Base",
					variants: [
						{
							variant_plan_id: variantId,
							name: "Annual",
							disable_version: true,
							migration: { draft: true },
							customize: {
								remove_items: [
									{
										feature_id: TestFeature.Messages,
										interval: ResetInterval.Month,
									},
								],
								add_items: [
									{
										feature_id: TestFeature.Messages,
										included: 1200,
										unlimited: false,
										reset: { interval: ResetInterval.Year },
									},
								],
							},
						},
					],
				},
			],
		}),
	);

	expect(error?.code).toBe(ErrCode.InvalidPropagationTarget);
});

test(`${chalk.yellowBright("migration drafts: base migration with direct variant customize is blocked")}`, async () => {
	const suffix = Math.random().toString(36).slice(2, 9);
	const planId = `draft_base_direct_variant_${suffix}`;
	const variantId = `${planId}_annual`;
	const { autumnV2_2 } = await setupPlan({ id: planId, variantId });

	const error = await catchErr(() =>
		autumnV2_2.catalog.update({
			plans: [
				{
					plan_id: planId,
					name: "Base",
					items: [messagesItem(500)],
					update_variant_ids: [variantId],
					disable_version: true,
					migration: { draft: true },
					variants: [
						{
							variant_plan_id: variantId,
							name: "Annual",
							customize: {
								remove_items: [
									{
										feature_id: TestFeature.Messages,
										interval: ResetInterval.Month,
									},
								],
								add_items: [
									{
										feature_id: TestFeature.Messages,
										included: 1200,
										unlimited: false,
										reset: { interval: ResetInterval.Year },
									},
								],
							},
						},
					],
				},
			],
		}),
	);

	expect(error?.code).toBe(ErrCode.InvalidPropagationTarget);
});

test(`${chalk.yellowBright("migration drafts: create-version updates do not create migration drafts")}`, async () => {
	const planId = `draft_create_version_${Math.random().toString(36).slice(2, 9)}`;
	const { autumnV2_2, ctx } = await setupPlan({ id: planId });

	await autumnV2_2.catalog.update({
		plans: [
			{
				plan_id: planId,
				name: "Base",
				items: [messagesItem(500)],
				force_version: true,
				migration: { draft: true },
			},
		],
	});

	const migrations = await migrationRepo.get({ ctx });
	expect(
		migrations.some((migration) =>
			JSON.stringify({
				filter: migration.filter,
				operations: migration.operations,
			}).includes(planId),
		),
	).toBe(false);
});
