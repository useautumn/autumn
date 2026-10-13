/**
 * A backdate over a live subscription is rejected, before anything is written, when recreating
 * it would lose or rebill something: a trial added to a paid one, Stripe Checkout, a start past
 * Stripe's 250-line backdate limit, or another entity's plan on it the request doesn't cover.
 * Backdating a trialing subscription is allowed (backdate-trialing/).
 */

import { expect, test } from "bun:test";
import {
	addInterval,
	BillingInterval,
	FreeTrialDuration,
	ms,
	type SetPlansParamsV0Input,
} from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import chalk from "chalk";
import {
	initLiveProScenario,
	liveSubscriptionPeriod,
} from "./utils/backdateLiveUtils";

const BEYOND_STRIPE_BACKDATE_LIMIT_MONTHS = 251;

test.concurrent(
	`${chalk.yellowBright("set-plans backdate live: a trial requested on a paid subscription is rejected and left untouched")}`,
	async () => {
		const { pro, customerId, autumnV2_4, ctx } = await initLiveProScenario({
			customerId: "set-plans-backdate-live-trial",
			advanceDays: 10,
		});
		const live = await liveSubscriptionPeriod({ ctx, customerId });

		await expectAutumnError({
			errMessage: "A paid subscription can't start a trial when backdated to",
			func: () =>
				autumnV2_4.billing.setPlans<SetPlansParamsV0Input>({
					customer_id: customerId,
					free_trial: {
						duration_length: 7,
						duration_type: FreeTrialDuration.Day,
					},
					phases: [
						{
							starts_at: live.startMs - ms.days(10),
							plans: [{ plan_id: pro.id }],
						},
					],
				}),
		});
		expect(
			(await ctx.stripeCli.subscriptions.retrieve(live.subscription.id)).status,
		).toBe("active");
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans backdate live: Stripe Checkout and a start past the 250-line limit are rejected")}`,
	async () => {
		const { pro, customerId, autumnV2_4, ctx, advancedTo } =
			await initLiveProScenario({
				customerId: "set-plans-backdate-live-checkout-limit",
				advanceDays: 10,
			});
		const live = await liveSubscriptionPeriod({ ctx, customerId });

		await expectAutumnError({
			errMessage: "Stripe Checkout can't backdate the subscription to",
			func: () =>
				autumnV2_4.billing.setPlans<SetPlansParamsV0Input>({
					customer_id: customerId,
					redirect_mode: "always",
					phases: [
						{
							starts_at: live.startMs - ms.days(10),
							plans: [{ plan_id: pro.id }],
						},
					],
				}),
		});
		await expectAutumnError({
			errMessage: "Stripe can't backdate the subscription this far",
			func: () =>
				autumnV2_4.billing.setPlans<SetPlansParamsV0Input>({
					customer_id: customerId,
					phases: [
						{
							starts_at: addInterval({
								from: advancedTo,
								interval: BillingInterval.Month,
								intervalCount: -BEYOND_STRIPE_BACKDATE_LIMIT_MONTHS,
							}),
							plans: [{ plan_id: pro.id }],
						},
					],
				}),
		});
		expect(
			(await ctx.stripeCli.subscriptions.retrieve(live.subscription.id)).status,
		).toBe("active");
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans backdate live: an entity request is rejected while another entity's plan shares the subscription")}`,
	async () => {
		const { pro, customerId, autumnV2_4, ctx, entities } =
			await initLiveProScenario({
				customerId: "set-plans-backdate-live-other-entity",
				entityCount: 2,
				advanceDays: 10,
			});
		const live = await liveSubscriptionPeriod({ ctx, customerId });

		await expectAutumnError({
			errMessage: "is on the subscription but not in this request",
			func: () =>
				autumnV2_4.billing.setPlans<SetPlansParamsV0Input>({
					customer_id: customerId,
					entity_id: entities[0]!.id,
					phases: [
						{
							starts_at: live.startMs - ms.days(10),
							plans: [{ plan_id: pro.id }],
						},
					],
				}),
		});
		expect(
			(await ctx.stripeCli.subscriptions.retrieve(live.subscription.id)).status,
		).toBe("active");
	},
);
