/**
 * Resync with ends_at: a subscription that was set to cancel keeps that end date (Q5, Q17, Q18).
 *
 * Contract:
 *   - ends_at equal to the anchor is allowed; the new subscription's cancel_at is ends_at.
 *   - Every plan ends on ends_at in Autumn, unscheduled plans included, and the preview lists them.
 *   - Stripe raises no invoice at the anchor, because the plans end there.
 *   - ends_at at or before the last phase start, or an anchor after ends_at, is rejected.
 */

import { expect, test } from "bun:test";
import {
	formatMsToDate,
	ms,
	msToSeconds,
	type SetPlansParamsV0Input,
} from "@autumn/shared";
import { advanceToAnchor } from "@tests/integration/billing/utils/advanceUtils/advanceToAnchor";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import {
	cancelSubscriptionForResync,
	expectPlansEndAt,
	expectResyncedSubscriptionCorrect,
} from "../utils/resyncUtils";

test.concurrent(
	`${chalk.yellowBright("set-plans resync ends_at: the rebuilt subscription and every plan end on ends_at")}`,
	async () => {
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const addOn = products.recurringAddOn({
			items: [items.monthlyWords({ includedUsage: 50 })],
		});

		const { customerId, autumnV2_4, ctx, advancedTo, testClockId } =
			await initScenario({
				customerId: "set-plans-resync-ends-at",
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({ list: [pro, addOn] }),
				],
				actions: [
					s.billing.attach({ productId: pro.id }),
					s.billing.attach({ productId: addOn.id }),
					s.advanceTestClock({ days: 10 }),
				],
			});

		const { oldSubscriptionId, oldStartMs, oldPeriodEndMs } =
			await cancelSubscriptionForResync({ ctx, customerId });
		const endsAt = oldPeriodEndMs;
		const params: SetPlansParamsV0Input = {
			customer_id: customerId,
			billing_cycle_anchor: oldPeriodEndMs,
			ends_at: endsAt,
			proration_behavior: "none",
			phases: [{ starts_at: oldStartMs, plans: [{ plan_id: pro.id }] }],
			unscheduled_plans: [{ plan_id: addOn.id }],
		};

		const preview = await autumnV2_4.billing.previewSetPlans(params);
		expect(preview.warnings).toContainEqual({
			type: "scheduled_cancel_changed",
			severity: "warning",
			message: `The plans end on ${formatMsToDate(endsAt)}.`,
		});
		const previewPlans = preview.phases[0]?.plans.map(
			({ plan_id, expires_at }) => ({ plan_id, expires_at }),
		);
		expect(previewPlans).toContainEqual({
			plan_id: pro.id,
			expires_at: endsAt,
		});
		expect(previewPlans).toContainEqual({
			plan_id: addOn.id,
			expires_at: endsAt,
		});

		await autumnV2_4.billing.setPlans(params);

		const subscription = await expectResyncedSubscriptionCorrect({
			ctx,
			customerId,
			oldSubscriptionId,
			startMs: oldStartMs,
			anchorMs: oldPeriodEndMs,
		});
		expect(subscription.cancel_at).toBe(msToSeconds(endsAt));
		await expectPlansEndAt({
			ctx,
			customerId,
			productIds: [pro.id, addOn.id],
			endsAt,
		});

		await advanceToAnchor({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			advancedTo,
			anchorMs: oldPeriodEndMs,
		});
		await expectCustomerInvoiceCorrect({ customerId, count: 2 });
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans resync ends_at: ends_at at the last phase start is rejected")}`,
	async () => {
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const premium = products.premium({
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const { customerId, autumnV2_4, advancedTo } = await initScenario({
			customerId: "set-plans-ends-at-before-phase",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [],
		});

		const lastPhaseStartsAt = advancedTo + ms.days(20);
		await expectAutumnError({
			errMessage: "ends_at must be after the last phase starts.",
			func: () =>
				autumnV2_4.billing.setPlans<SetPlansParamsV0Input>({
					customer_id: customerId,
					ends_at: lastPhaseStartsAt,
					phases: [
						{ starts_at: "now", plans: [{ plan_id: pro.id }] },
						{
							starts_at: lastPhaseStartsAt,
							plans: [{ plan_id: premium.id }],
						},
					],
				}),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans resync ends_at: an anchor after ends_at is rejected")}`,
	async () => {
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { customerId, autumnV2_4, advancedTo } = await initScenario({
			customerId: "set-plans-anchor-after-ends-at",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		await expectAutumnError({
			errMessage: "billing_cycle_anchor cannot be after ends_at.",
			func: () =>
				autumnV2_4.billing.setPlans<SetPlansParamsV0Input>({
					customer_id: customerId,
					billing_cycle_anchor: advancedTo + ms.days(20),
					ends_at: advancedTo + ms.days(10),
					proration_behavior: "none",
					phases: [
						{
							starts_at: advancedTo - ms.days(10),
							plans: [{ plan_id: pro.id }],
						},
					],
				}),
		});
	},
);
