/**
 * TDD coverage for update_plan migrations over createSchedule-managed scheduled rows.
 *
 * Contract under test:
 *   New behaviors:
 *     - Future scheduled rows created by createSchedule can be version-migrated.
 *     - Replacing one product in a multi-plan future phase rewires only that ID.
 *     - Feature quantities/options on scheduled rows survive replacement.
 *   Side effects:
 *     - `no_billing_changes: true` updates Autumn only and leaves the Stripe schedule unchanged.
 *     - Schedule phases never point at deleted customer product IDs.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { CusProductStatus, ms } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectNoExpiredCustomerProducts } from "@tests/integration/billing/utils/expectNoExpiredCustomerProducts";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import type Stripe from "stripe";
import { runUpdatePlanMigration } from "../../utils/runUpdatePlanMigration";
import {
	expectNoCustomerProductRow,
	getCustomerProductBalances,
	getCustomerProductFeatureIds,
	getCustomerProductPriceAmounts,
	getPhaseCustomerProductIds,
	getRequiredStripeScheduleId,
	getScheduledCustomerProductRow,
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

test(`${chalk.yellowBright("migrations update_plan scheduled createSchedule: future row replacement rewires one multi-plan phase ID")}`, async () => {
	const customerId = "migration-update-scheduled-create-schedule";
	const activePlan = products.pro({
		id: "scheduled-create-schedule-active",
		items: [items.monthlyWords({ includedUsage: 100 })],
	});
	const futurePlan = products.base({
		id: "scheduled-create-schedule-base",
		items: [
			items.monthlyMessages({ includedUsage: 100 }),
			items.monthlyPrice({ price: 20 }),
		],
	});
	const untouchedFuturePlan = products.base({
		id: "scheduled-create-schedule-untouched",
		group: "backup",
		items: [
			items.monthlyPrice({ price: 40 }),
			items.monthlyWords({ includedUsage: 50 }),
		],
	});

	const { autumnV1, autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [activePlan, futurePlan, untouchedFuturePlan] }),
		],
		actions: [],
	});

	const now = Date.now();
	const response = await autumnV1.billing.createSchedule({
		customer_id: customerId,
		phases: [
			{
				starts_at: now,
				plans: [{ plan_id: activePlan.id }],
			},
			{
				starts_at: now + ms.days(30),
				plans: [
					{ plan_id: futurePlan.id },
					{ plan_id: untouchedFuturePlan.id },
				],
			},
		],
	});
	const scheduledBefore = await getScheduledCustomerProductRow({
		ctx,
		customerId,
		productId: futurePlan.id,
	});
	const untouchedScheduledBefore = await getScheduledCustomerProductRow({
		ctx,
		customerId,
		productId: untouchedFuturePlan.id,
	});
	expect(response.phases[1]?.customer_product_ids).toEqual([
		scheduledBefore.id,
		untouchedScheduledBefore.id,
	]);

	const stripeScheduleId = getRequiredStripeScheduleId({
		scheduledIds: scheduledBefore.scheduledIds,
	});
	const stripeScheduleBefore =
		await ctx.stripeCli.subscriptionSchedules.retrieve(stripeScheduleId);
	const stripeSignatureBefore = stripeScheduleSignature(
		stripeScheduleBefore as Stripe.SubscriptionSchedule,
	);

	await autumnV1.products.update(futurePlan.id, {
		items: [
			items.monthlyPrice({ price: 30 }),
			items.monthlyMessages({ includedUsage: 250 }),
		],
	});

	await runUpdatePlanMigration({
		ctx,
		migrationClient: autumnV2_2,
		migrationId: `${customerId}-mig-${Date.now()}`,
		customerId,
		noBillingChanges: true,
		filter: { customer: { plan: { plan_id: futurePlan.id } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: futurePlan.id, version: 1 },
					version: 2,
				},
			],
		},
		runOnServer: false,
	});

	await expectNoCustomerProductRow({
		ctx,
		customerProductId: scheduledBefore.id,
	});
	const scheduledAfter = await getScheduledCustomerProductRow({
		ctx,
		customerId,
		productId: futurePlan.id,
	});
	expect(scheduledAfter.id).not.toBe(scheduledBefore.id);
	expect(scheduledAfter.version).toBe(2);
	expect(scheduledAfter.startsAt).toBe(scheduledBefore.startsAt);
	expect(scheduledAfter.scheduledIds).toEqual(scheduledBefore.scheduledIds);
	expect(
		await getPhaseCustomerProductIds({
			ctx,
			customerProductId: scheduledAfter.id,
		}),
	).toEqual([scheduledAfter.id, untouchedScheduledBefore.id]);
	expect(
		await getCustomerProductPriceAmounts({
			ctx,
			customerProductId: scheduledAfter.id,
		}),
	).toEqual([30]);
	expect(
		await getCustomerProductFeatureIds({
			ctx,
			customerProductId: scheduledAfter.id,
		}),
	).toEqual([TestFeature.Messages]);
	const stripeScheduleAfter =
		await ctx.stripeCli.subscriptionSchedules.retrieve(stripeScheduleId);
	expect(stripeScheduleSignature(stripeScheduleAfter as Stripe.SubscriptionSchedule)).toEqual(
		stripeSignatureBefore,
	);
	await expectNoExpiredCustomerProducts({ ctx, customerId, productId: futurePlan.id });
	await expectCustomerInvoiceCorrect({
		customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
		count: 1,
		latestTotal: 20,
	});
});

test(`${chalk.yellowBright("migrations update_plan scheduled createSchedule: feature quantities survive replacement")}`, async () => {
	const customerId = "migration-update-scheduled-quantity";
	const activePlan = products.pro({
		id: "scheduled-quantity-active",
		items: [items.monthlyWords({ includedUsage: 100 })],
	});
	const futurePlan = products.base({
		id: "scheduled-quantity-future",
		items: [
			items.monthlyPrice({ price: 20 }),
			items.prepaidMessages(),
		],
	});

	const { autumnV1, autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [activePlan, futurePlan] }),
		],
		actions: [],
	});

	const now = Date.now();
	await autumnV1.billing.createSchedule({
		customer_id: customerId,
		phases: [
			{
				starts_at: now,
				plans: [{ plan_id: activePlan.id }],
			},
			{
				starts_at: now + ms.days(30),
				plans: [
					{
						plan_id: futurePlan.id,
						feature_quantities: [
							{
								feature_id: TestFeature.Messages,
								quantity: 400,
							},
						],
					},
				],
			},
		],
	});
	const scheduledBefore = await getScheduledCustomerProductRow({
		ctx,
		customerId,
		productId: futurePlan.id,
	});
	expect(scheduledBefore.options).toEqual([
		expect.objectContaining({
			feature_id: TestFeature.Messages,
			quantity: 4,
		}),
	]);

	await autumnV1.products.update(futurePlan.id, {
		items: [
			items.monthlyPrice({ price: 25 }),
			items.prepaidMessages(),
		],
	});

	await runUpdatePlanMigration({
		ctx,
		migrationClient: autumnV2_2,
		migrationId: `${customerId}-mig-${Date.now()}`,
		customerId,
		noBillingChanges: true,
		filter: { customer: { plan: { plan_id: futurePlan.id } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: futurePlan.id, version: 1 },
					version: 2,
				},
			],
		},
		runOnServer: false,
	});

	await expectNoCustomerProductRow({
		ctx,
		customerProductId: scheduledBefore.id,
	});
	const scheduledAfter = await getScheduledCustomerProductRow({
		ctx,
		customerId,
		productId: futurePlan.id,
	});
	expect(scheduledAfter.version).toBe(2);
	expect(scheduledAfter.options).toEqual([
		expect.objectContaining({
			feature_id: TestFeature.Messages,
			quantity: 4,
		}),
	]);
	expect(
		await getCustomerProductBalances({
			ctx,
			customerProductId: scheduledAfter.id,
		}),
	).toEqual([
		expect.objectContaining({
			featureId: TestFeature.Messages,
			balance: 400,
		}),
	]);
});
