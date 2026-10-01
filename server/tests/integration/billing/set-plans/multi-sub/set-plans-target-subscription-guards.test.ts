/**
 * set_plans with stripe_subscription_id rejects requests that would cross
 * subscriptions; without it, the multi-subscription 400 is unchanged.
 */

import { expect, test } from "bun:test";
import { ErrCode } from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import chalk from "chalk";
import {
	fetchLiveCustomerProduct,
	initMultiSubScenario,
} from "./multiSubScenario";

test.concurrent(
	`${chalk.yellowBright("set-plans multi-sub guards: each cross-subscription request is rejected before any write")}`,
	async () => {
		const customerId = "set-plans-multi-sub-guards";
		const { autumnV2_4, ctx, subscriptionA, subscriptionB, plans } =
			await initMultiSubScenario({ customerId });
		const proBefore = await fetchLiveCustomerProduct({
			ctx,
			customerId,
			productId: plans.pro.id,
		});

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			errMessage: `is billed per year, but subscription ${subscriptionA} is billed per month. Plans on one subscription must share a billing interval.`,
			func: () =>
				autumnV2_4.billing.setPlans({
					customer_id: customerId,
					stripe_subscription_id: subscriptionA,
					phases: [
						{
							starts_at: "now",
							plans: [
								{ plan_id: plans.pro.id },
								{ plan_id: plans.annualAddOn.id },
							],
						},
					],
				}),
		});

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			errMessage: `is already billed on subscription ${subscriptionB}, so it can't be edited from subscription ${subscriptionA}.`,
			func: () =>
				autumnV2_4.billing.setPlans({
					customer_id: customerId,
					stripe_subscription_id: subscriptionA,
					phases: [
						{
							starts_at: "now",
							plans: [{ plan_id: plans.pro.id }, { plan_id: plans.seats.id }],
						},
					],
				}),
		});

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			errMessage:
				"Subscription sub_not_linked isn't linked to any of this customer's plans.",
			func: () =>
				autumnV2_4.billing.setPlans({
					customer_id: customerId,
					stripe_subscription_id: "sub_not_linked",
					phases: [{ starts_at: "now", plans: [{ plan_id: plans.pro.id }] }],
				}),
		});

		const proAfter = await fetchLiveCustomerProduct({
			ctx,
			customerId,
			productId: plans.pro.id,
		});
		expect(proAfter?.id).toBe(proBefore?.id);
		expect(
			await fetchLiveCustomerProduct({
				ctx,
				customerId,
				productId: plans.annualAddOn.id,
			}),
		).toBeUndefined();
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans multi-sub: without a target, plans on two subscriptions still hit the existing 400")}`,
	async () => {
		const customerId = "set-plans-multi-sub-no-target";
		const { autumnV2_4, plans } = await initMultiSubScenario({ customerId });

		await expectAutumnError({
			errMessage:
				"Cannot update products across multiple existing subscriptions.",
			func: () =>
				autumnV2_4.billing.setPlans({
					customer_id: customerId,
					phases: [
						{
							starts_at: "now",
							plans: [{ plan_id: plans.pro.id }, { plan_id: plans.seats.id }],
						},
					],
				}),
		});
	},
);
