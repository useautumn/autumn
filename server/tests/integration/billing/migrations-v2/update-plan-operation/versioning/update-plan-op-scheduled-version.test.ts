/**
 * TDD coverage for `update_plan` version migrations targeting scheduled customer products.
 *
 * Contract under test:
 *   New behaviors:
 *     - Scheduled customer products are selected by customer and operation plan filters.
 *     - Scheduled version updates delete the old scheduled row and insert a replacement.
 *     - Entity-scoped scheduled rows are selected and replaced independently.
 *     - Explicit `plan_filter.custom: true` opts custom scheduled rows into version updates.
 *     - Active and scheduled rows for the same plan can be migrated together.
 *   Side effects:
 *     - Scheduled replacements do not leave expired scheduled rows.
 *     - Coupled migrations keep Stripe subscriptions/schedules consistent with Autumn.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { CusProductStatus, ms } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectProductCanceling,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectNoExpiredCustomerProducts } from "@tests/integration/billing/utils/expectNoExpiredCustomerProducts";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import type Stripe from "stripe";
import { runUpdatePlanMigration } from "../../utils/runUpdatePlanMigration";
import {
	expectNoCustomerProductRow,
	getCustomerProductFeatureIds,
	getCustomerProductRows,
	getPhaseCustomerProductIds,
	getRequiredStripeScheduleId,
	getScheduledCustomerProductRow,
	getScheduledCustomerProductRows,
} from "../utils/scheduledCustomerProductTestUtils";

const stripeScheduleSignature = (schedule: Stripe.SubscriptionSchedule) => ({
	status: schedule.status,
	currentPhase: schedule.current_phase,
	phases: schedule.phases.map((phase) => ({
		startDate: phase.start_date,
		endDate: phase.end_date,
		items: phase.items.map((item) => ({
			price: typeof item.price === "string" ? item.price : item.price.id,
			quantity: item.quantity,
		})),
	})),
});

test(`${chalk.yellowBright("migrations update_plan scheduled version: scheduled downgrade is selected and replaced")}`, async () => {
	const customerId = "migration-update-scheduled-version";
	const pro = products.pro({
		id: "scheduled-version-pro",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});
	const premium = products.premium({
		id: "scheduled-version-premium",
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
	await expectProductCanceling({ customer: beforeCustomer, productId: premium.id });
	await expectProductScheduled({ customer: beforeCustomer, productId: pro.id });
	const invoiceCountBefore = beforeCustomer.invoices?.length ?? 0;
	const scheduledBefore = await getScheduledCustomerProductRow({
		ctx,
		customerId,
		productId: pro.id,
	});

	await autumnV1.products.update(pro.id, {
		items: [
			items.monthlyPrice({ price: 20 }),
			items.monthlyMessages({ includedUsage: 600 }),
		],
	});

	const expectScheduledReplacement = async () => {
		await expectNoCustomerProductRow({
			ctx,
			customerProductId: scheduledBefore.id,
		});
		const scheduledAfter = await getScheduledCustomerProductRow({
			ctx,
			customerId,
			productId: pro.id,
		});
		expect(scheduledAfter.id).not.toBe(scheduledBefore.id);
		expect(scheduledAfter.version).toBe(2);
		expect(scheduledAfter.startsAt).toBe(scheduledBefore.startsAt);
		expect(scheduledAfter.scheduledIds ?? []).toHaveLength(1);
	};

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
					version: 2,
				},
			],
		},
		waitFor: expectScheduledReplacement,
		runOnServer: false,
		timeoutMs: 60_000,
	});
	await expectScheduledReplacement();

	const afterCustomer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({ customer: afterCustomer, productId: premium.id });
	await expectProductScheduled({ customer: afterCustomer, productId: pro.id });
	await expectCustomerInvoiceCorrect({ customer: afterCustomer, count: invoiceCountBefore });
	await expectNoExpiredCustomerProducts({ ctx, customerId, productId: pro.id });
	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

test(`${chalk.yellowBright("migrations update_plan scheduled version: entity-scoped scheduled rows are replaced")}`, async () => {
	const customerId = "migration-update-scheduled-entity-version";
	const pro = products.pro({
		id: "scheduled-entity-pro",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});
	const premium = products.premium({
		id: "scheduled-entity-premium",
		items: [items.monthlyMessages({ includedUsage: 1000 })],
	});

	const { autumnV1, autumnV2_2, ctx, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({ productId: premium.id, entityIndex: 0 }),
			s.billing.attach({ productId: premium.id, entityIndex: 1 }),
			s.billing.attach({ productId: pro.id, entityIndex: 0 }),
			s.billing.attach({ productId: pro.id, entityIndex: 1 }),
		],
	});

	const scheduledBefore = await getScheduledCustomerProductRows({
		ctx,
		customerId,
		productId: pro.id,
	});
	expect(scheduledBefore.map((row) => row.entityId).sort()).toEqual(
		entities.map((entity) => entity.id).sort(),
	);

	await autumnV1.products.update(pro.id, {
		items: [
			items.monthlyPrice({ price: 20 }),
			items.monthlyMessages({ includedUsage: 700 }),
		],
	});

	await runUpdatePlanMigration({
		ctx,
		migrationClient: autumnV2_2,
		migrationId: `${customerId}-mig-${Date.now()}`,
		customerId,
		runOnServer: false,
		filter: { customer: { plan: { plan_id: pro.id } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: pro.id },
					version: 2,
				},
			],
		},
	});

	for (const row of scheduledBefore) {
		await expectNoCustomerProductRow({ ctx, customerProductId: row.id });
		const scheduledAfter = await getScheduledCustomerProductRow({
			ctx,
			customerId,
			productId: pro.id,
			entityId: row.entityId,
		});
		expect(scheduledAfter.id).not.toBe(row.id);
		expect(scheduledAfter.version).toBe(2);
		expect(await getCustomerProductFeatureIds({ ctx, customerProductId: scheduledAfter.id })).toEqual([
			TestFeature.Messages,
		]);
	}
	await expectNoExpiredCustomerProducts({ ctx, customerId, productId: pro.id });
	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

test(`${chalk.yellowBright("migrations update_plan scheduled version: custom scheduled plan can be explicitly updated")}`, async () => {
	const customerId = "migration-update-scheduled-custom-override";
	const regular = products.base({
		id: "scheduled-custom-override-regular",
		items: [
			items.monthlyPrice({ price: 10 }),
			items.monthlyMessages({ includedUsage: 100 }),
		],
	});
	const customFuture = products.base({
		id: "scheduled-custom-override-future",
		items: [
			items.monthlyPrice({ price: 20 }),
			items.monthlyMessages({ includedUsage: 100 }),
		],
	});

	const { autumnV1, autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [regular, customFuture] }),
		],
		actions: [],
	});

	const now = Date.now();
	await autumnV1.billing.createSchedule({
		customer_id: customerId,
		phases: [
			{
				starts_at: now,
				plans: [{ plan_id: regular.id }],
			},
			{
				starts_at: now + ms.days(30),
				plans: [
					{
						plan_id: customFuture.id,
						customize: {
							price: itemsV2.monthlyPrice({ amount: 25 }),
							items: [itemsV2.monthlyWords({ included: 250 })],
						},
					},
				],
			},
		],
	});
	const scheduledBefore = await getScheduledCustomerProductRow({
		ctx,
		customerId,
		productId: customFuture.id,
	});
	expect(scheduledBefore.isCustom).toBe(true);
	expect(await getCustomerProductFeatureIds({ ctx, customerProductId: scheduledBefore.id })).toEqual([
		TestFeature.Words,
	]);

	await autumnV1.products.update(customFuture.id, {
		items: [
			items.monthlyPrice({ price: 30 }),
			items.monthlyMessages({ includedUsage: 500 }),
		],
	});

	await runUpdatePlanMigration({
		ctx,
		migrationClient: autumnV2_2,
		migrationId: `${customerId}-mig-${Date.now()}`,
		customerId,
		filter: { customer: { plan: { plan_id: customFuture.id } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: customFuture.id, custom: true },
					version: 2,
				},
			],
		},
		runOnServer: false,
	});

	await expectNoCustomerProductRow({ ctx, customerProductId: scheduledBefore.id });
	const scheduledAfter = await getScheduledCustomerProductRow({
		ctx,
		customerId,
		productId: customFuture.id,
	});
	expect(scheduledAfter.id).not.toBe(scheduledBefore.id);
	expect(scheduledAfter.version).toBe(2);
	expect(await getCustomerProductFeatureIds({ ctx, customerProductId: scheduledAfter.id })).toEqual([
		TestFeature.Messages,
	]);
	await expectNoExpiredCustomerProducts({ ctx, customerId, productId: customFuture.id });
	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

test(`${chalk.yellowBright("migrations update_plan scheduled version: custom scheduled plan is skipped by default")}`, async () => {
	const customerId = "migration-update-scheduled-custom-skip";
	const regular = products.base({
		id: "scheduled-custom-skip-regular",
		items: [
			items.monthlyPrice({ price: 10 }),
			items.monthlyMessages({ includedUsage: 100 }),
		],
	});
	const customFuture = products.base({
		id: "scheduled-custom-skip-future",
		items: [
			items.monthlyPrice({ price: 20 }),
			items.monthlyMessages({ includedUsage: 100 }),
		],
	});

	const { autumnV1, autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [regular, customFuture] }),
		],
		actions: [],
	});

	const now = Date.now();
	await autumnV1.billing.createSchedule({
		customer_id: customerId,
		phases: [
			{
				starts_at: now,
				plans: [{ plan_id: regular.id }],
			},
			{
				starts_at: now + ms.days(30),
				plans: [
					{
						plan_id: customFuture.id,
						customize: {
							items: [itemsV2.monthlyWords({ included: 250 })],
						},
					},
				],
			},
		],
	});
	const scheduledBefore = await getScheduledCustomerProductRow({
		ctx,
		customerId,
		productId: customFuture.id,
	});
	expect(scheduledBefore.isCustom).toBe(true);
	expect(await getCustomerProductFeatureIds({ ctx, customerProductId: scheduledBefore.id })).toEqual([
		TestFeature.Words,
	]);

	await autumnV1.products.update(customFuture.id, {
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	await runUpdatePlanMigration({
		ctx,
		migrationClient: autumnV2_2,
		migrationId: `${customerId}-mig-${Date.now()}`,
		customerId,
		filter: { customer: { plan: { plan_id: customFuture.id } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: customFuture.id },
					version: 2,
				},
			],
		},
		runOnServer: false,
	});

	const scheduledAfter = await getScheduledCustomerProductRow({
		ctx,
		customerId,
		productId: customFuture.id,
	});
	expect(scheduledAfter.id).toBe(scheduledBefore.id);
	expect(scheduledAfter.version).toBe(1);
	expect(scheduledAfter.isCustom).toBe(true);
	expect(await getCustomerProductFeatureIds({ ctx, customerProductId: scheduledAfter.id })).toEqual([
		TestFeature.Words,
	]);
	await expectNoExpiredCustomerProducts({
		ctx,
		customerId,
		productId: customFuture.id,
	});
	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

test(`${chalk.yellowBright("migrations update_plan scheduled version: mixed active and scheduled rows for same plan update together")}`, async () => {
	const customerId = "migration-update-scheduled-mixed-same-plan";
	const plan = products.pro({
		id: "scheduled-mixed-pro",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { autumnV1, autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [s.customer({ paymentMethod: "success" }), s.products({ list: [plan] })],
		actions: [],
	});

	const now = Date.now();
	await autumnV1.billing.createSchedule({
		customer_id: customerId,
		phases: [
			{
				starts_at: now,
				plans: [{ plan_id: plan.id }],
			},
			{
				starts_at: now + ms.days(30),
				plans: [{ plan_id: plan.id }],
			},
		],
	});
	const activeBefore = await getCustomerProductRows({
		ctx,
		customerId,
		productId: plan.id,
		status: CusProductStatus.Active,
	});
	const scheduledBefore = await getScheduledCustomerProductRow({
		ctx,
		customerId,
		productId: plan.id,
	});
	expect(activeBefore).toHaveLength(1);
	const stripeScheduleId = getRequiredStripeScheduleId({
		scheduledIds: scheduledBefore.scheduledIds,
	});
	const stripeScheduleBefore =
		await ctx.stripeCli.subscriptionSchedules.retrieve(stripeScheduleId);
	const stripeSignatureBefore = stripeScheduleSignature(
		stripeScheduleBefore as Stripe.SubscriptionSchedule,
	);

	await autumnV1.products.update(plan.id, {
		items: [items.monthlyMessages({ includedUsage: 250 })],
	});

	await runUpdatePlanMigration({
		ctx,
		migrationClient: autumnV2_2,
		migrationId: `${customerId}-mig-${Date.now()}`,
		customerId,
		noBillingChanges: true,
		filter: { customer: { plan: { plan_id: plan.id, version: 1 } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: plan.id, version: 1 },
					version: 2,
				},
			],
		},
		runOnServer: false,
	});

	await expectNoCustomerProductRow({ ctx, customerProductId: scheduledBefore.id });
	const activeAfter = await getCustomerProductRows({
		ctx,
		customerId,
		productId: plan.id,
		status: CusProductStatus.Active,
	});
	const scheduledAfter = await getScheduledCustomerProductRow({
		ctx,
		customerId,
		productId: plan.id,
	});
	expect(activeAfter).toHaveLength(1);
	expect(activeAfter[0]!.version).toBe(2);
	expect(scheduledAfter.version).toBe(2);
	expect(
		await getPhaseCustomerProductIds({
			ctx,
			customerProductId: scheduledAfter.id,
		}),
	).toEqual([scheduledAfter.id]);
	const stripeScheduleAfter =
		await ctx.stripeCli.subscriptionSchedules.retrieve(stripeScheduleId);
	expect(stripeScheduleSignature(stripeScheduleAfter as Stripe.SubscriptionSchedule)).toEqual(
		stripeSignatureBefore,
	);
});
