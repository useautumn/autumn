/**
 * TDD coverage for update_plan item patch migrations.
 *
 * Contract under test:
 *   - update_plan reuses update-subscription patch semantics for add_items,
 *     remove_items, usage carry, and rollover carry.
 *   - Migration execution does not create extra invoices.
 *   - Existing customer products are patched, not replaced or expired.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3, ApiCustomerV5 } from "@autumn/shared";
import { CusProductStatus, customerProducts, customers } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectNoExpiredCustomerProducts } from "@tests/integration/billing/utils/expectNoExpiredCustomerProducts";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { expectFlagCorrect } from "@tests/integration/utils/expectFlagCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { and, eq } from "drizzle-orm";
import { runUpdatePlanMigration } from "../../utils/runUpdatePlanMigration";

const getActiveCustomerProductIsCustom = async ({
	ctx,
	customerId,
	productId,
}: {
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
	customerId: string;
	productId: string;
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
				eq(customerProducts.product_id, productId),
				eq(customerProducts.status, CusProductStatus.Active),
			),
		);

	return row?.isCustom;
};

test.concurrent(`${chalk.yellowBright("migrations update_plan: add boolean and metered entitlements")}`, async () => {
	const customerId = "migration-update-add-items";
	const pro = products.pro({ items: [] });

	const { autumnV1, autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	const expectMigrationApplied = async () => {
		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		await expectCustomerProducts({ customer, active: [pro.id] });
		expectFlagCorrect({
			customer,
			featureId: TestFeature.Dashboard,
			planId: pro.id,
		});
		expectBalanceCorrect({
			customer,
			featureId: TestFeature.Words,
			remaining: 150,
			usage: 0,
			planId: pro.id,
		});
		return customer;
	};

	await runUpdatePlanMigration({
		ctx,
		migrationClient: autumnV2_2,
		migrationId: `${customerId}-mig`,
		customerId,
		filter: { customer: { plan: { plan_id: pro.id } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: pro.id },
					customize: {
						add_items: [
							itemsV2.dashboard(),
							itemsV2.monthlyWords({ included: 150 }),
						],
					},
				},
			],
		},
		runOnServer: true,
		waitFor: async () => {
			await expectMigrationApplied();
		},
		timeoutMs: 60_000,
	});

	await expectMigrationApplied();
	await expectCustomerInvoiceCorrect({
		customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
		count: 1,
		latestTotal: 20,
	});
	expect(
		await getActiveCustomerProductIsCustom({ ctx, customerId, productId: pro.id }),
	).toBe(false);
	await expectNoExpiredCustomerProducts({ ctx, customerId, productId: pro.id });
	await expectStripeSubscriptionCorrect({ ctx, customerId });
});
