/**
 * TDD coverage for scheduled `update_plan` patch/customize migrations.
 *
 * Contract under test:
 *   New behaviors:
 *     - Scheduled customer products are selected by update_plan customize operations.
 *     - Customize patches mutate the scheduled row in place instead of delete+insert.
 *   Side effects:
 *     - No expired scheduled rows are created.
 *     - Coupled migrations keep Stripe subscription schedules consistent with Autumn.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectNoExpiredCustomerProducts } from "@tests/integration/billing/utils/expectNoExpiredCustomerProducts";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { runUpdatePlanMigration } from "../../utils/runUpdatePlanMigration";
import {
	getCustomerProductFeatureIds,
	getCustomerProductPriceAmounts,
	getScheduledCustomerProductRow,
} from "../utils/scheduledCustomerProductTestUtils";

test(`${chalk.yellowBright("migrations update_plan scheduled patch: customize updates scheduled row in place")}`, async () => {
	const customerId = "migration-update-scheduled-patch";
	const pro = products.pro({
		id: "scheduled-patch-pro",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});
	const premium = products.premium({
		id: "scheduled-patch-premium",
		items: [items.monthlyMessages({ includedUsage: 1000 })],
	});

	const { autumnV1, autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [
			s.billing.attach({ productId: premium.id }),
			s.billing.attach({ productId: pro.id }),
		],
	});

	const beforeCustomer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const invoiceCountBefore = beforeCustomer.invoices?.length ?? 0;
	const scheduledBefore = await getScheduledCustomerProductRow({
		ctx,
		customerId,
		productId: pro.id,
	});

	await runUpdatePlanMigration({
		ctx,
		migrationClient: autumnV2_2,
		migrationId: `${customerId}-mig-${Date.now()}`,
		customerId,
		filter: { customer: { plan: { plan_id: pro.id } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: pro.id },
					customize: {
						price: itemsV2.monthlyPrice({ amount: 24 }),
						add_items: [itemsV2.dashboard()],
					},
				},
			],
		},
		runOnServer: false,
	});

	const scheduledAfter = await getScheduledCustomerProductRow({
		ctx,
		customerId,
		productId: pro.id,
	});
	expect(scheduledAfter.id).toBe(scheduledBefore.id);
	expect(scheduledAfter.version).toBe(1);
	expect(
		await getCustomerProductPriceAmounts({
			ctx,
			customerProductId: scheduledAfter.id,
		}),
	).toEqual([24]);
	expect(
		await getCustomerProductFeatureIds({
			ctx,
			customerProductId: scheduledAfter.id,
		}),
	).toEqual([TestFeature.Dashboard, TestFeature.Messages]);
	await expectNoExpiredCustomerProducts({ ctx, customerId, productId: pro.id });
	await expectCustomerInvoiceCorrect({
		customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
		count: invoiceCountBefore,
	});
	await expectStripeSubscriptionCorrect({ ctx, customerId });
});
