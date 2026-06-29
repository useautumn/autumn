import { expect, test } from "bun:test";
import {
	type ApiPlanV1,
	ApiVersion,
	BillingInterval,
	ResetInterval,
	type UpdatePlanParamsV2Input,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli.js";
import { migrationRepo } from "@/internal/migrations/v2/repos/index.js";
import { expectMigrationDrafts } from "./expectMigrationDrafts.js";

type RpcUpdate = Omit<UpdatePlanParamsV2Input, "plan_id">;

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
			...(variantCustomerId ? [s.otherCustomers([{ id: variantCustomerId }])] : []),
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
				filter: { customer: { plan: { plan_id: planId } } },
				noBillingChanges: true,
				operation: {
					type: "update_plan",
					plan_filter: { plan_id: planId, custom: false },
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
						plan: { plan_id: { $in: [planId, variantId] } },
					},
				},
				noBillingChanges: true,
				operation: {
					type: "update_plan",
					plan_filter: {
						plan_id: { $in: [planId, variantId] },
						custom: false,
					},
					customize: messagesDiff(500),
				},
			},
		],
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
				filter: { customer: { plan: { plan_id: planId, version: 1 } } },
				noBillingChanges: true,
				operation: {
					type: "update_plan",
					plan_filter: { plan_id: planId, version: 1, custom: false },
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
						},
					},
				},
				noBillingChanges: true,
				operation: {
					type: "update_plan",
					plan_filter: {
						plan_id: { $in: [planId, variantId] },
						version: 1,
						custom: false,
					},
					customize: messagesDiff(500),
				},
			},
		],
	});
});

test(`${chalk.yellowBright("migration drafts: direct variant price update marks billing changes")}`, async () => {
	const suffix = Math.random().toString(36).slice(2, 9);
	const planId = `draft_variant_price_${suffix}`;
	const variantId = `${planId}_annual`;
	const { autumnV2_2, ctx } = await setupPlan({ id: planId, variantId });

	await autumnV2_2.catalog.update({
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
							price: {
								amount: 20,
								interval: BillingInterval.Year,
							},
						},
					},
				],
			},
		],
	});

	expectMigrationDrafts({
		migrations: await migrationRepo.get({ ctx }),
		expected: [
			{
				planIds: [variantId],
				filter: { customer: { plan: { plan_id: variantId, version: 1 } } },
				noBillingChanges: false,
				operation: {
					type: "update_plan",
					plan_filter: { plan_id: variantId, version: 1, custom: false },
					customize: {
						price: {
							amount: 20,
							interval: BillingInterval.Year,
						},
					},
				},
			},
		],
	});
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
