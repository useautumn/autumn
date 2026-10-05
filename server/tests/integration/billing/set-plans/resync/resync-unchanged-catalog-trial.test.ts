/**
 * Re-saving plans whose catalog has a free trial the rows were never granted leaves everything in place.
 *
 * Red (before):  the live trial plan was expired and re-inserted, and the scheduled one deleted and re-inserted,
 *                because a row's granted trial was compared against the plan's catalog trial.
 * Green (after): the same rows, Stripe subscription and schedule, and no new invoice.
 */

import { expect, test } from "bun:test";
import {
	CusProductStatus,
	ms,
	type SetPlansParamsV0Input,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService";
import { findStripeSubscriptionByStatus } from "../utils/subscriptionStateUtils";

const PRO_MONTHLY_PRICE = 20;

const customerProductRows = async ({
	ctx,
	customerId,
}: {
	ctx: TestContext;
	customerId: string;
}) => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		inStatuses: [CusProductStatus.Active, CusProductStatus.Scheduled],
	});
	return fullCustomer.customer_products
		.map((customerProduct) => ({
			planId: customerProduct.product_id,
			status: customerProduct.status,
			id: customerProduct.id,
			startsAt: customerProduct.starts_at,
			freeTrialId: customerProduct.free_trial_id,
		}))
		.sort((first, second) => first.planId.localeCompare(second.planId));
};

const liveSubscriptionState = async ({
	ctx,
	customerId,
}: {
	ctx: TestContext;
	customerId: string;
}) => {
	const subscription = await findStripeSubscriptionByStatus({
		ctx,
		customerId,
		status: "active",
	});
	return { id: subscription.id, schedule: subscription.schedule };
};

test.concurrent(
	`${chalk.yellowBright("set-plans unchanged catalog trial: re-saving plans never granted their catalog trial keeps every row, the subscription and its schedule")}`,
	async () => {
		const proTrial = products.proWithTrial({
			id: "catalog-trial-pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
			trialDays: 14,
		});
		const premiumTrial = products.premiumWithTrial({
			id: "catalog-trial-premium",
			items: [items.monthlyMessages({ includedUsage: 500 })],
			trialDays: 14,
		});

		const { customerId, autumnV1, autumnV2_4, ctx } = await initScenario({
			customerId: "set-plans-unchanged-catalog-trial",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [proTrial, premiumTrial] }),
			],
			actions: [],
		});

		await autumnV2_4.billing.setPlans({
			customer_id: customerId,
			free_trial: null,
			phases: [
				{ starts_at: "now", plans: [{ plan_id: proTrial.id }] },
				{
					starts_at: Date.now() + ms.days(30),
					plans: [{ plan_id: premiumTrial.id }],
				},
			],
		});

		const rowsBefore = await customerProductRows({ ctx, customerId });
		expect(rowsBefore.map(({ freeTrialId }) => freeTrialId)).toEqual([
			null,
			null,
		]);
		const scheduledStart = rowsBefore.find(
			({ status }) => status === CusProductStatus.Scheduled,
		)?.startsAt;
		expect(scheduledStart).toBeDefined();
		const subscriptionBefore = await liveSubscriptionState({
			ctx,
			customerId,
		});
		expect(subscriptionBefore.schedule).toBeTruthy();
		await expectCustomerInvoiceCorrect({
			customerId,
			autumn: autumnV1,
			count: 1,
			latestTotal: PRO_MONTHLY_PRICE,
		});

		const params: SetPlansParamsV0Input = {
			customer_id: customerId,
			phases: [
				{ starts_at: "now", plans: [{ plan_id: proTrial.id }] },
				{
					starts_at: scheduledStart as number,
					plans: [{ plan_id: premiumTrial.id }],
				},
			],
		};

		const preview = await autumnV2_4.billing.previewSetPlans(params);
		expect(preview.total).toBe(0);
		expect(
			preview.phases.map((phase) =>
				phase.plans.map((plan) => `${plan.plan_id}:${plan.status}`),
			),
		).toEqual([[`${proTrial.id}:kept`], [`${premiumTrial.id}:kept`]]);

		await autumnV2_4.billing.setPlans(params);

		expect(await customerProductRows({ ctx, customerId })).toEqual(rowsBefore);
		expect(await liveSubscriptionState({ ctx, customerId })).toEqual(
			subscriptionBefore,
		);
		await expectCustomerInvoiceCorrect({
			customerId,
			autumn: autumnV1,
			count: 1,
			latestTotal: PRO_MONTHLY_PRICE,
		});
	},
);
