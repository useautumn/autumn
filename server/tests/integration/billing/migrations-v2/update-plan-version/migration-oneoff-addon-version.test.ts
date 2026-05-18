/**
 * TDD coverage for update_plan version migrations on one-off addon plans.
 *
 * Contract under test:
 *   Behavior:
 *     - update_plan with version: 2 moves customers from v1 -> v2 of a
 *       one-off addon plan (type: one_off, isAddOn: true) where v2 only
 *       adds feature entitlements (no price change).
 *     - Post-migration: customer's active product reflects v2; new
 *       entitlements are present on the customer.
 *   Side effects:
 *     - No new Stripe invoice is generated for the migrated customer.
 *     - If the customer also has a separate recurring main subscription,
 *       its Stripe subscription is untouched (anchor + items unchanged).
 *     - no_billing_changes=true: migration completes via DB-only path
 *       without raising the "produced Stripe mutations" error.
 *     - no_billing_changes=false: migration still completes; with no
 *       price delta there is nothing to bill and no invoice is created.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectStripeSubscriptionUnchanged } from "@tests/integration/billing/utils/stripe/expectStripeSubscriptionUnchanged";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { prepare } from "@/internal/migrations/v2/prepare/prepare.js";
import { migrateCustomer } from "@/internal/migrations/v2/run/migrateCustomer/index.js";
import { preProcessMigration } from "@/internal/migrations/v2/run/preProcess/index.js";
import { runUpdatePlanMigration } from "../utils/runUpdatePlanMigration";

const newFeatureItem = () => items.dashboard();

test.concurrent(`${chalk.yellowBright("migrations update_plan: one-off addon v1->v2 adds features without invoicing")}`, async () => {
	const customerId = "mig-oneoff-addon-basic";
	const addon = products.oneOffAddOn({
		id: "oneoff-addon-basic",
		items: [],
	});

	const { autumnV1, autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [addon] }),
		],
		actions: [s.billing.attach({ productId: addon.id })],
	});

	const invoiceCountBefore =
		(await autumnV1.customers.get<ApiCustomerV3>(customerId)).invoices
			?.length ?? 0;

	// v2: just adds an extra feature (Dashboard boolean). Base price unchanged.
	await autumnV1.products.update(addon.id, {
		items: [items.oneOffPrice({ price: 10 }), newFeatureItem()],
	});

	await runUpdatePlanMigration({
		ctx,
		migrationClient: autumnV2_2,
		migrationId: `${customerId}-mig`,
		customerId,
		filter: { customer: { plan: { plan_id: addon.id } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: addon.id },
					version: 2,
				},
			],
		},
		runOnServer: false,
	});

	const customerV3 = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerProducts({ customer: customerV3, active: [addon.id] });
	expect(customerV3.features?.[TestFeature.Dashboard]).toBeDefined();
	await expectCustomerInvoiceCorrect({
		customer: customerV3,
		count: invoiceCountBefore,
	});
});

test.concurrent(`${chalk.yellowBright("migrations update_plan: one-off addon v2 migration leaves main subscription untouched")}`, async () => {
	const customerId = "mig-oneoff-addon-with-main";
	const pro = products.pro({
		id: "mig-oneoff-main-pro",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});
	const addon = products.oneOffAddOn({
		id: "mig-oneoff-addon-with-main",
		items: [],
	});

	const { autumnV1, autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, addon] }),
		],
		actions: [
			s.billing.attach({ productId: pro.id }),
			s.billing.attach({ productId: addon.id }),
		],
	});

	const fullCustomerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const stripeCustomerId = fullCustomerBefore.stripe_id;
	expect(stripeCustomerId).toBeDefined();

	const subsBefore = await ctx.stripeCli.subscriptions.list({
		customer: stripeCustomerId as string,
		status: "all",
	});
	const mainSubBefore = subsBefore.data.find(
		(sub) => sub.status === "active" || sub.status === "trialing",
	);
	expect(mainSubBefore).toBeDefined();

	const invoiceCountBefore = fullCustomerBefore.invoices?.length ?? 0;

	await autumnV1.products.update(addon.id, {
		items: [items.oneOffPrice({ price: 10 }), newFeatureItem()],
	});

	await runUpdatePlanMigration({
		ctx,
		migrationClient: autumnV2_2,
		migrationId: `${customerId}-mig`,
		customerId,
		filter: { customer: { plan: { plan_id: addon.id } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: addon.id },
					version: 2,
				},
			],
		},
		runOnServer: false,
	});

	const customerV3 = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerProducts({
		customer: customerV3,
		active: [pro.id, addon.id],
	});
	expect(customerV3.features?.[TestFeature.Dashboard]).toBeDefined();

	const mainSubAfter = await ctx.stripeCli.subscriptions.retrieve(
		mainSubBefore!.id,
	);
	expectStripeSubscriptionUnchanged({
		before: mainSubBefore!,
		after: mainSubAfter,
	});

	await expectCustomerInvoiceCorrect({
		customer: customerV3,
		count: invoiceCountBefore,
	});
});

test.concurrent(`${chalk.yellowBright("migrations update_plan: one-off addon v2 with no_billing_changes=true takes DB-only path")}`, async () => {
	const customerId = "mig-oneoff-addon-nbc-true";
	const addon = products.oneOffAddOn({
		id: "mig-oneoff-addon-nbc-true",
		items: [],
	});

	const { autumnV1, autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [addon] }),
		],
		actions: [s.billing.attach({ productId: addon.id })],
	});

	const invoiceCountBefore =
		(await autumnV1.customers.get<ApiCustomerV3>(customerId)).invoices
			?.length ?? 0;

	await autumnV1.products.update(addon.id, {
		items: [items.oneOffPrice({ price: 10 }), newFeatureItem()],
	});

	const migration = await autumnV2_2.migrationsV2.deleteAndCreate({
		id: `${customerId}-mig`,
		filter: { customer: { plan: { plan_id: addon.id } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: addon.id },
					version: 2,
				},
			],
		},
	});

	const migrationWithFlag = preProcessMigration({
		...migration,
		no_billing_changes: true,
	});
	const { preparedState } = await prepare({
		ctx,
		migration: migrationWithFlag,
		dryRun: false,
	});
	const preparedMigration = {
		...migrationWithFlag,
		prepared_state: preparedState,
	};

	await migrateCustomer({
		ctx,
		customerId,
		migration: preparedMigration,
	});

	const customerV3 = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerProducts({ customer: customerV3, active: [addon.id] });
	expect(customerV3.features?.[TestFeature.Dashboard]).toBeDefined();
	await expectCustomerInvoiceCorrect({
		customer: customerV3,
		count: invoiceCountBefore,
	});
});

test.concurrent(`${chalk.yellowBright("migrations update_plan: one-off addon v2 with no_billing_changes=false still does not invoice")}`, async () => {
	const customerId = "mig-oneoff-addon-nbc-false";
	const addon = products.oneOffAddOn({
		id: "mig-oneoff-addon-nbc-false",
		items: [],
	});

	const { autumnV1, autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [addon] }),
		],
		actions: [s.billing.attach({ productId: addon.id })],
	});

	const invoiceCountBefore =
		(await autumnV1.customers.get<ApiCustomerV3>(customerId)).invoices
			?.length ?? 0;

	await autumnV1.products.update(addon.id, {
		items: [items.oneOffPrice({ price: 10 }), newFeatureItem()],
	});

	const migration = await autumnV2_2.migrationsV2.deleteAndCreate({
		id: `${customerId}-mig`,
		filter: { customer: { plan: { plan_id: addon.id } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: addon.id },
					version: 2,
				},
			],
		},
	});

	const migrationWithFlag = preProcessMigration({
		...migration,
		no_billing_changes: false,
	});
	const { preparedState } = await prepare({
		ctx,
		migration: migrationWithFlag,
		dryRun: false,
	});
	const preparedMigration = {
		...migrationWithFlag,
		prepared_state: preparedState,
	};

	await migrateCustomer({
		ctx,
		customerId,
		migration: preparedMigration,
	});

	const customerV3 = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerProducts({ customer: customerV3, active: [addon.id] });
	expect(customerV3.features?.[TestFeature.Dashboard]).toBeDefined();
	await expectCustomerInvoiceCorrect({
		customer: customerV3,
		count: invoiceCountBefore,
	});
});

test.concurrent(`${chalk.yellowBright("migrations update_plan: non-addon one-off v1->v2 adds features without invoicing")}`, async () => {
	const customerId = "mig-oneoff-nonaddon";
	const plan = products.oneOff({
		id: "mig-oneoff-nonaddon-plan",
		items: [],
		isAddOn: false,
	});

	const { autumnV1, autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [plan] }),
		],
		actions: [s.billing.attach({ productId: plan.id })],
	});

	const invoiceCountBefore =
		(await autumnV1.customers.get<ApiCustomerV3>(customerId)).invoices
			?.length ?? 0;

	await autumnV1.products.update(plan.id, {
		items: [items.oneOffPrice({ price: 10 }), newFeatureItem()],
	});

	await runUpdatePlanMigration({
		ctx,
		migrationClient: autumnV2_2,
		migrationId: `${customerId}-mig`,
		customerId,
		filter: { customer: { plan: { plan_id: plan.id } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: plan.id },
					version: 2,
				},
			],
		},
		runOnServer: false,
	});

	const customerV3 = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerProducts({ customer: customerV3, active: [plan.id] });
	expect(customerV3.features?.[TestFeature.Dashboard]).toBeDefined();
	const migratedProduct = customerV3.products?.find((p) => p.id === plan.id);
	expect(migratedProduct?.version).toBe(2);
	await expectCustomerInvoiceCorrect({
		customer: customerV3,
		count: invoiceCountBefore,
	});
});

test.concurrent(`${chalk.yellowBright("migrations update_plan: customized cusProduct is not touched by migration")}`, async () => {
	const customerId = "mig-oneoff-addon-customized";
	const addon = products.oneOffAddOn({
		id: "mig-oneoff-addon-customized",
		items: [
			items.oneOffMessages({ includedUsage: 100, billingUnits: 100, price: 5 }),
		],
	});

	const { autumnV1, autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [addon] }),
		],
		actions: [
			s.billing.attach({
				productId: addon.id,
				items: [
					items.oneOffMessages({
						includedUsage: 999,
						billingUnits: 100,
						price: 5,
					}),
				],
			}),
		],
	});

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const invoiceCountBefore = customerBefore.invoices?.length ?? 0;
	const productBefore = customerBefore.products?.find((p) => p.id === addon.id);
	expect(productBefore?.version).toBe(1);
	const messagesItemBefore = productBefore?.items?.find(
		(i) => "feature_id" in i && i.feature_id === TestFeature.Messages,
	);
	expect(messagesItemBefore).toBeDefined();
	const customizedIncludedUsage =
		messagesItemBefore && "included_usage" in messagesItemBefore
			? messagesItemBefore.included_usage
			: undefined;
	expect(customizedIncludedUsage).toBe(999);

	await autumnV1.products.update(addon.id, {
		items: [
			items.oneOffPrice({ price: 5 }),
			items.oneOffMessages({ includedUsage: 100, billingUnits: 100, price: 5 }),
			newFeatureItem(),
		],
	});

	await runUpdatePlanMigration({
		ctx,
		migrationClient: autumnV2_2,
		migrationId: `${customerId}-mig`,
		customerId,
		filter: { customer: { plan: { plan_id: addon.id } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: addon.id },
					version: 2,
				},
			],
		},
		runOnServer: false,
	});

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const productAfter = customerAfter.products?.find((p) => p.id === addon.id);
	expect(productAfter, "customized cusProduct should still exist").toBeDefined();
	expect(
		productAfter?.version,
		"customized cusProduct should NOT be migrated to v2",
	).toBe(1);

	const messagesItemAfter = productAfter?.items?.find(
		(i) => "feature_id" in i && i.feature_id === TestFeature.Messages,
	);
	const includedUsageAfter =
		messagesItemAfter && "included_usage" in messagesItemAfter
			? messagesItemAfter.included_usage
			: undefined;
	expect(
		includedUsageAfter,
		"customized included_usage should be preserved",
	).toBe(999);

	expect(
		customerAfter.features?.[TestFeature.Dashboard],
		"v2 feature should NOT be granted to customized cusProduct",
	).toBeUndefined();

	await expectCustomerInvoiceCorrect({
		customer: customerAfter,
		count: invoiceCountBefore,
	});
});
