/**
 * TDD coverage for server-run migrations when Autumn scheduled rows are missing.
 *
 * Contract under test:
 *   New behaviors:
 *     - A server-run migration can still update selected non-scheduled rows when
 *       a Stripe schedule exists but its Autumn scheduled customer product was deleted.
 *   Side effects:
 *     - `no_billing_changes: true` must not mutate the existing Stripe subscription schedule.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { CusProductStatus, ms } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario } from "@tests/utils/testInitUtils/initScenario";
import { s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import type Stripe from "stripe";
import { runUpdatePlanMigration } from "../../utils/runUpdatePlanMigration";
import {
	deleteCustomerProductRows,
	expectNoCustomerProductRow,
	getCustomerProductFeatureIds,
	getCustomerProductRows,
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

test(`${chalk.yellowBright("migrations update_plan scheduled dangling: server-run no billing does not touch Stripe schedule")}`, async () => {
	const customerId = "migration-update-scheduled-dangling";
	const pro = products.pro({
		id: "scheduled-dangling-pro",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const premium = products.premium({
		id: "scheduled-dangling-premium",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const { autumnV1, autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [],
	});

	const now = Date.now();
	await autumnV1.billing.createSchedule({
		customer_id: customerId,
		phases: [
			{
				starts_at: now,
				plans: [{ plan_id: pro.id }],
			},
			{
				starts_at: now + ms.days(30),
				plans: [{ plan_id: premium.id }],
			},
		],
	});

	const scheduledPremium = await getScheduledCustomerProductRow({
		ctx,
		customerId,
		productId: premium.id,
	});
	const stripeScheduleId = getRequiredStripeScheduleId({
		scheduledIds: scheduledPremium.scheduledIds,
	});
	const stripeScheduleBefore =
		await ctx.stripeCli.subscriptionSchedules.retrieve(stripeScheduleId);
	const stripeSignatureBefore = stripeScheduleSignature(
		stripeScheduleBefore as Stripe.SubscriptionSchedule,
	);

	await deleteCustomerProductRows({
		ctx,
		customerProductIds: [scheduledPremium.id],
	});
	await expectNoCustomerProductRow({
		ctx,
		customerProductId: scheduledPremium.id,
	});

	const expectActivePlanUpdated = async () => {
		const activeRows = await getCustomerProductRows({
			ctx,
			customerId,
			productId: pro.id,
			status: CusProductStatus.Active,
		});
		expect(activeRows).toHaveLength(1);
		expect(
			await getCustomerProductFeatureIds({
				ctx,
				customerProductId: activeRows[0]!.id,
			}),
		).toEqual([TestFeature.Dashboard, TestFeature.Messages]);
	};

	await runUpdatePlanMigration({
		ctx,
		migrationClient: autumnV2_2,
		migrationId: `${customerId}-mig-${Date.now()}`,
		customerId,
		noBillingChanges: true,
		runOnServer: true,
		filter: { customer: { plan: { plan_id: pro.id } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: pro.id },
					customize: {
						add_items: [itemsV2.dashboard()],
					},
				},
			],
		},
		waitFor: expectActivePlanUpdated,
		timeoutMs: 60_000,
	});
	await expectActivePlanUpdated();

	const stripeScheduleAfter =
		await ctx.stripeCli.subscriptionSchedules.retrieve(stripeScheduleId);
	expect(stripeScheduleSignature(stripeScheduleAfter as Stripe.SubscriptionSchedule)).toEqual(
		stripeSignatureBefore,
	);
	expect(
		await getCustomerProductRows({
			ctx,
			customerId,
			productId: premium.id,
			status: CusProductStatus.Scheduled,
		}),
	).toEqual([]);
	await expectCustomerInvoiceCorrect({
		customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
		count: 1,
		latestTotal: 20,
	});
});
