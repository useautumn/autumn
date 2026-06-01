/**
 * TDD coverage for update_plan.customize.update_items — basic flows.
 *
 * Contract under test:
 *   New types/fields:
 *     - customize.update_items: Array<{ filter: PlanItemFilter; included?: number }>
 *   New behaviors:
 *     - Bumping `included` for a matched item updates the entitlement's
 *       allowance and balance, while carrying existing usage forward.
 *     - Lowering `included` below current usage drops the balance accordingly
 *       (no overage created beyond the carried usage).
 *     - `next_reset_at` is preserved across update_items (no cycle shift).
 *   Side effects:
 *     - The customer product is marked is_custom = true after the migration.
 *     - No Stripe invoice is generated.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3, ApiCustomerV5 } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { runUpdatePlanMigration } from "../../utils/runUpdatePlanMigration";

const expectActiveProductIsCustom = async ({
	ctx,
	customerId,
	productId,
	isCustom,
}: {
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
	customerId: string;
	productId: string;
	isCustom: boolean;
}) => {
	const customer = await CusService.get({
		db: ctx.db,
		idOrInternalId: customerId,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	if (!customer) throw new Error(`Customer ${customerId} not found`);
	const cusProducts = await CusProductService.list({
		db: ctx.db,
		internalCustomerId: customer.internal_id,
	});
	const cusProduct = cusProducts.find(
		(candidate) => candidate.product.id === productId,
	);
	expect(
		cusProduct,
		`active cusProduct ${productId} not found for customer ${customerId}`,
	).toBeDefined();
	expect(cusProduct?.is_custom).toBe(isCustom);
};

test.concurrent(`${chalk.yellowBright("migrations update_items: bump included carries usage forward")}`, async () => {
	const customerId = "migration-update-items-basic-bump";
	const base = products.base({
		id: "migration-update-items-basic-bump-plan",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { autumnV1, autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [s.customer(), s.products({ list: [base] })],
		actions: [
			s.billing.attach({ productId: base.id }),
			s.track({ featureId: TestFeature.Messages, value: 30, timeout: 2000 }),
		],
	});

	await runUpdatePlanMigration({
		ctx,
		migrationClient: autumnV2_2,
		migrationId: `${customerId}-mig`,
		customerId,
		filter: { customer: { plan: { plan_id: base.id } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: base.id },
					customize: {
						update_items: [
							{ filter: { feature_id: TestFeature.Messages }, included: 200 },
						],
					},
				},
			],
		},
	});

	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	await expectCustomerProducts({ customer, active: [base.id] });
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 170,
		usage: 30,
		planId: base.id,
	});

	await expectActiveProductIsCustom({
		ctx,
		customerId,
		productId: base.id,
		isCustom: true,
	});

	await expectCustomerInvoiceCorrect({
		customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
		count: 0,
	});
});

test.concurrent(`${chalk.yellowBright("migrations update_items: lower included below current usage clamps balance to zero")}`, async () => {
	const customerId = "migration-update-items-basic-lower";
	const base = products.base({
		id: "migration-update-items-basic-lower-plan",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [s.customer(), s.products({ list: [base] })],
		actions: [
			s.billing.attach({ productId: base.id }),
			s.track({ featureId: TestFeature.Messages, value: 30, timeout: 2000 }),
		],
	});

	await runUpdatePlanMigration({
		ctx,
		migrationClient: autumnV2_2,
		migrationId: `${customerId}-mig`,
		customerId,
		filter: { customer: { plan: { plan_id: base.id } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: base.id },
					customize: {
						update_items: [
							{ filter: { feature_id: TestFeature.Messages }, included: 50 },
						],
					},
				},
			],
		},
	});

	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 20,
		usage: 30,
		planId: base.id,
	});
});

test.concurrent(`${chalk.yellowBright("migrations update_items: preserves next_reset_at on the updated entitlement")}`, async () => {
	const customerId = "migration-update-items-reset-preserved";
	const base = products.base({
		id: "migration-update-items-reset-preserved-plan",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [s.customer(), s.products({ list: [base] })],
		actions: [s.billing.attach({ productId: base.id })],
	});

	const before = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	const beforeResetAt = before.balances[TestFeature.Messages]?.next_reset_at;
	expect(
		beforeResetAt,
		"pre-update next_reset_at should be set on monthly entitlement",
	).not.toBeNull();

	await runUpdatePlanMigration({
		ctx,
		migrationClient: autumnV2_2,
		migrationId: `${customerId}-mig`,
		customerId,
		filter: { customer: { plan: { plan_id: base.id } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: base.id },
					customize: {
						update_items: [
							{ filter: { feature_id: TestFeature.Messages }, included: 300 },
						],
					},
				},
			],
		},
	});

	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 300,
		usage: 0,
		nextResetAt: beforeResetAt as number,
		planId: base.id,
	});
});
