/**
 * set_plans with a past phases[0].starts_at over a live subscription that has a saved later phase:
 * - the old subscription is cancelled with no final invoice, which cancels its schedule too;
 * - the subscription is recreated from the backdated date, anchored on the old period end;
 * - the live plan stays active on it once the old subscription's webhooks settle;
 * - a new schedule on it starts the later phase on its date;
 * - every period is billed exactly once.
 */

import { expect, test } from "bun:test";
import {
	CusProductStatus,
	ms,
	type SetPlansParamsV0Input,
} from "@autumn/shared";
import { startsAtProducts } from "@tests/integration/billing/set-plans/starts-at/utils/futureStartUtils";
import { expectPreviewWarning } from "@tests/integration/billing/set-plans/utils/subscriptionStateUtils";
import chalk from "chalk";
import {
	expectCustomerProductHoldsAcrossWebhooks,
	expectEachPeriodBilledOnce,
	expectRecreatedSubscriptionCorrect,
	expectReplacedSubscriptionCancelledQuietly,
	expectScheduledOnRecreatedSchedule,
	initLiveProScenario,
	liveSubscriptionPeriod,
} from "./utils/backdateLiveUtils";

const LATER_PHASE_DAYS_AFTER_RENEWAL = 10;
const LIVE_DAYS = 10;

/** Live pro, aged LIVE_DAYS, with a saved later phase switching to premium after its renewal. */
const initScheduledLivePro = async ({ customerId }: { customerId: string }) => {
	const { premium } = startsAtProducts();
	const scenario = await initLiveProScenario({
		customerId,
		advanceDays: LIVE_DAYS,
		otherProducts: [premium],
	});
	const { pro, autumnV2_4, ctx } = scenario;
	const beforeSchedule = await liveSubscriptionPeriod({ ctx, customerId });
	const laterPhaseStart =
		beforeSchedule.periodEndMs + ms.days(LATER_PHASE_DAYS_AFTER_RENEWAL);
	const laterPhase = {
		starts_at: laterPhaseStart,
		plans: [{ plan_id: premium.id }],
	};
	await autumnV2_4.billing.setPlans<SetPlansParamsV0Input>({
		customer_id: customerId,
		phases: [{ starts_at: "now", plans: [{ plan_id: pro.id }] }, laterPhase],
	});

	const live = await liveSubscriptionPeriod({ ctx, customerId });
	const oldScheduleId = live.subscription.schedule as string;
	expect(oldScheduleId).toBeString();
	return {
		...scenario,
		premium,
		laterPhase,
		laterPhaseStart,
		live,
		oldScheduleId,
	};
};

test.concurrent(
	`${chalk.yellowBright("set-plans backdate live: a subscription with a saved later phase is recreated with its schedule")}`,
	async () => {
		const {
			pro,
			premium,
			customerId,
			autumnV2_4,
			ctx,
			laterPhase,
			laterPhaseStart,
			live,
			oldScheduleId,
		} = await initScheduledLivePro({
			customerId: "set-plans-backdate-live-schedule",
		});
		const backdatedStart = live.startMs - ms.days(20);
		const params: SetPlansParamsV0Input = {
			customer_id: customerId,
			phases: [
				{ starts_at: backdatedStart, plans: [{ plan_id: pro.id }] },
				laterPhase,
			],
		};

		const preview = await autumnV2_4.billing.previewSetPlans(params);
		expect(preview.total).toBe(0);
		expectPreviewWarning({
			preview,
			type: "subscription_recreated_backdated",
			messageContains: [
				"cancelled and recreated from",
				"Its saved schedule is replaced.",
			],
		});
		expect(
			preview.processor_changes.map(({ type, id, action }) => [
				type,
				id,
				action,
			]),
		).toEqual([
			["subscription", null, "created"],
			["subscription", live.subscription.id, "canceled"],
			["subscription_schedule", null, "created"],
		]);

		await autumnV2_4.billing.setPlans(params);

		const oldSchedule =
			await ctx.stripeCli.subscriptionSchedules.retrieve(oldScheduleId);
		expect(oldSchedule.status).toBe("canceled");
		await expectReplacedSubscriptionCancelledQuietly({
			ctx,
			subscriptionId: live.subscription.id,
			invoiceCountBefore: live.invoiceCount,
		});
		const recreated = await expectRecreatedSubscriptionCorrect({
			ctx,
			customerId,
			replacedSubscriptionId: live.subscription.id,
			startMs: backdatedStart,
			periodEndMs: live.periodEndMs,
			renewalTotal: 20,
		});

		const newScheduleId = recreated.schedule as string;
		expect(newScheduleId).toBeString();
		expect(newScheduleId).not.toBe(oldScheduleId);

		await expectCustomerProductHoldsAcrossWebhooks({
			ctx,
			customerId,
			productId: pro.id,
			assert: (livePro) => {
				expect(livePro.status).toBe(CusProductStatus.Active);
				expect(livePro.subscription_ids).toEqual([recreated.id]);
			},
		});
		await expectScheduledOnRecreatedSchedule({
			ctx,
			customerId,
			productId: premium.id,
			subscriptionId: recreated.id,
			scheduleId: newScheduleId,
			startsAt: laterPhaseStart,
		});

		await expectEachPeriodBilledOnce({
			ctx,
			customerId,
			periods: [
				{ startMs: backdatedStart, endMs: live.startMs, total: 0 },
				{ startMs: live.periodStartMs, endMs: live.periodEndMs, total: 20 },
			],
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans backdate live: moving a scheduled subscription's started phase later recreates it and its schedule, billing nothing again")}`,
	async () => {
		const {
			pro,
			premium,
			customerId,
			autumnV2_4,
			ctx,
			laterPhase,
			laterPhaseStart,
			live,
			oldScheduleId,
		} = await initScheduledLivePro({
			customerId: "set-plans-backdate-live-schedule-later",
		});
		const laterPastStart = live.startMs + ms.days(LIVE_DAYS / 2);
		const params: SetPlansParamsV0Input = {
			customer_id: customerId,
			phases: [
				{ starts_at: laterPastStart, plans: [{ plan_id: pro.id }] },
				laterPhase,
			],
		};

		const preview = await autumnV2_4.billing.previewSetPlans(params);
		expect(preview.total).toBe(0);
		expectPreviewWarning({
			preview,
			type: "subscription_recreated_backdated",
			messageContains: ["cancelled and recreated from"],
		});

		await autumnV2_4.billing.setPlans(params);

		const oldSchedule =
			await ctx.stripeCli.subscriptionSchedules.retrieve(oldScheduleId);
		expect(oldSchedule.status).toBe("canceled");
		await expectReplacedSubscriptionCancelledQuietly({
			ctx,
			subscriptionId: live.subscription.id,
			invoiceCountBefore: live.invoiceCount,
		});
		const recreated = await expectRecreatedSubscriptionCorrect({
			ctx,
			customerId,
			replacedSubscriptionId: live.subscription.id,
			startMs: laterPastStart,
			periodEndMs: live.periodEndMs,
			renewalTotal: 20,
		});

		await expectCustomerProductHoldsAcrossWebhooks({
			ctx,
			customerId,
			productId: pro.id,
			assert: (livePro) => {
				expect(livePro.status).toBe(CusProductStatus.Active);
				expect(livePro.subscription_ids).toEqual([recreated.id]);
			},
		});
		await expectScheduledOnRecreatedSchedule({
			ctx,
			customerId,
			productId: premium.id,
			subscriptionId: recreated.id,
			scheduleId: recreated.schedule as string,
			startsAt: laterPhaseStart,
		});

		const resave = await autumnV2_4.billing.previewSetPlans(params);
		expect(resave.total).toBe(0);
		expect(resave.warnings.map(({ type }) => type)).not.toContain(
			"subscription_recreated_backdated",
		);

		await expectEachPeriodBilledOnce({
			ctx,
			customerId,
			periods: [
				{ startMs: live.periodStartMs, endMs: live.periodEndMs, total: 20 },
			],
		});
	},
);
