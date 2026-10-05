/**
 * set_plans with a past phases[0].starts_at over a healthy live subscription, only moving the start:
 * - the live subscription is cancelled with no final invoice and recreated from the backdated date,
 *   anchored on its period end, so the renewal date and price don't move;
 * - nothing is charged now, the time before the old start is never billed, and the period the
 *   old subscription paid is billed exactly once;
 * - the plan stays Active on the recreated subscription while the old one's webhooks land;
 * - usage tracked before the backdate is kept, included usage isn't granted again, and the
 *   balance still resets on the old renewal date;
 * - the preview warns about the recreate and lists both the cancel and the create.
 */

import { expect, test } from "bun:test";
import {
	CusProductStatus,
	ms,
	type SetPlansParamsV0Input,
} from "@autumn/shared";
import { expectPlanStartsAt } from "@tests/integration/billing/set-plans/utils/resyncUtils";
import { expectPreviewWarning } from "@tests/integration/billing/set-plans/utils/subscriptionStateUtils";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import {
	expectCustomerProductHoldsAcrossWebhooks,
	expectEachPeriodBilledOnce,
	expectRecreatedSubscriptionCorrect,
	expectReplacedSubscriptionCancelledQuietly,
	initLiveProScenario,
	liveSubscriptionPeriod,
} from "./utils/backdateLiveUtils";

const TRACKED_MESSAGES = 30;

test.concurrent(
	`${chalk.yellowBright("set-plans backdate live: a monthly plan moved before its start is recreated with no new charge, active across the old subscription's webhooks")}`,
	async () => {
		const { pro, customerId, autumnV2_4, ctx } = await initLiveProScenario({
			customerId: "set-plans-backdate-live-monthly",
			advanceDays: 10,
		});
		const live = await liveSubscriptionPeriod({ ctx, customerId });
		const backdatedStart = live.startMs - ms.days(20);
		const params: SetPlansParamsV0Input = {
			customer_id: customerId,
			phases: [{ starts_at: backdatedStart, plans: [{ plan_id: pro.id }] }],
		};

		const preview = await autumnV2_4.billing.previewSetPlans(params);
		expect(preview.total).toBe(0);
		expectPreviewWarning({
			preview,
			type: "subscription_recreated_backdated",
			messageContains: ["cancelled and recreated from"],
		});
		expect(
			preview.processor_changes.map(({ id, action }) => [id, action]),
		).toEqual([
			[null, "created"],
			[live.subscription.id, "canceled"],
		]);

		await autumnV2_4.billing.setPlans(params);

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
		await expectCustomerProductHoldsAcrossWebhooks({
			ctx,
			customerId,
			productId: pro.id,
			assert: (livePro) => {
				expect(livePro.status).toBe(CusProductStatus.Active);
				expect(livePro.subscription_ids).toEqual([recreated.id]);
			},
		});
		await expectEachPeriodBilledOnce({
			ctx,
			customerId,
			periods: [
				{ startMs: backdatedStart, endMs: live.startMs, total: 0 },
				{ startMs: live.periodStartMs, endMs: live.periodEndMs, total: 20 },
			],
		});
		await expectPlanStartsAt({
			ctx,
			customerId,
			productId: pro.id,
			startsAt: backdatedStart,
		});
		await expectBalanceCorrect({
			customerId,
			featureId: TestFeature.Messages,
			remaining: 100,
			nextResetAt: live.periodEndMs,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans backdate live: usage tracked before a backdate is kept and the balance still resets on the old renewal")}`,
	async () => {
		const { pro, customerId, autumnV2_4, ctx } = await initLiveProScenario({
			customerId: "set-plans-backdate-live-balances",
			afterAttach: () => [
				s.track({
					featureId: TestFeature.Messages,
					value: TRACKED_MESSAGES,
					timeout: 3000,
				}),
			],
			advanceDays: 10,
		});
		const live = await liveSubscriptionPeriod({ ctx, customerId });
		const backdatedStart = live.startMs - ms.days(20);

		await autumnV2_4.billing.setPlans<SetPlansParamsV0Input>({
			customer_id: customerId,
			phases: [{ starts_at: backdatedStart, plans: [{ plan_id: pro.id }] }],
		});

		await expectRecreatedSubscriptionCorrect({
			ctx,
			customerId,
			replacedSubscriptionId: live.subscription.id,
			startMs: backdatedStart,
			periodEndMs: live.periodEndMs,
			renewalTotal: 20,
		});
		await expectBalanceCorrect({
			customerId,
			autumn: autumnV2_4,
			featureId: TestFeature.Messages,
			granted: 100,
			usage: TRACKED_MESSAGES,
			remaining: 100 - TRACKED_MESSAGES,
			nextResetAt: live.periodEndMs,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans backdate live: an annual plan moved after its start renews on the same date for the full year")}`,
	async () => {
		const proAnnual = products.proAnnual({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { customerId, autumnV2_4, ctx } = await initScenario({
			customerId: "set-plans-backdate-live-annual",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [proAnnual] }),
			],
			actions: [
				s.billing.attach({ productId: proAnnual.id }),
				s.advanceTestClock({ months: 2 }),
			],
		});
		const live = await liveSubscriptionPeriod({ ctx, customerId });
		const backdatedStart = live.startMs + ms.days(15);
		const params: SetPlansParamsV0Input = {
			customer_id: customerId,
			phases: [
				{ starts_at: backdatedStart, plans: [{ plan_id: proAnnual.id }] },
			],
		};

		const preview = await autumnV2_4.billing.previewSetPlans(params);
		expect(preview.total).toBe(0);

		await autumnV2_4.billing.setPlans(params);

		await expectReplacedSubscriptionCancelledQuietly({
			ctx,
			subscriptionId: live.subscription.id,
			invoiceCountBefore: live.invoiceCount,
		});
		await expectRecreatedSubscriptionCorrect({
			ctx,
			customerId,
			replacedSubscriptionId: live.subscription.id,
			startMs: backdatedStart,
			periodEndMs: live.periodEndMs,
			renewalTotal: 200,
		});
		await expectEachPeriodBilledOnce({
			ctx,
			customerId,
			periods: [
				{ startMs: live.periodStartMs, endMs: live.periodEndMs, total: 200 },
			],
		});
		await expectPlanStartsAt({
			ctx,
			customerId,
			productId: proAnnual.id,
			startsAt: backdatedStart,
		});
	},
);
