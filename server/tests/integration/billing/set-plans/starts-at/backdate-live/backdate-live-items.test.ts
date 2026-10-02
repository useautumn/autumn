/**
 * A backdate over a live subscription moves everything on it, unchanged:
 * - an add-on, a prepaid quantity and metered usage carry over; the prepaid quantity isn't
 *   charged again (the new subscription's first invoice is $0) and the usage is billed once,
 *   at the old renewal date;
 * - entity plans sharing the subscription all move onto the recreated one, none billed twice.
 */

import { expect, test } from "bun:test";
import { ms, type SetPlansParamsV0Input } from "@autumn/shared";
import { advanceToAnchor } from "@tests/integration/billing/utils/advanceUtils/advanceToAnchor";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addMonths } from "date-fns";
import { Decimal } from "decimal.js";
import { findLiveCustomerProduct } from "../utils/futureStartUtils";
import {
	expectEachPeriodBilledOnce,
	expectRecreatedSubscriptionCorrect,
	expectReplacedSubscriptionCancelledQuietly,
	initLiveProScenario,
	liveSubscriptionPeriod,
} from "./utils/backdateLiveUtils";

const PREPAID_MESSAGES = 200;
const WORDS_USED = 40;
const WORDS_USAGE_TOTAL = 2;

test.concurrent(
	`${chalk.yellowBright("set-plans backdate live: an add-on, prepaid quantity and metered usage carry over, the usage billed once")}`,
	async () => {
		const pro = products.pro({
			items: [
				items.prepaidMessages({ billingUnits: 100, price: 10 }),
				items.consumableWords(),
			],
		});
		const addOn = products.recurringAddOn({
			items: [items.monthlyUsers({ includedUsage: 5 })],
		});
		const { customerId, autumnV1, autumnV2_4, ctx, advancedTo, testClockId } =
			await initScenario({
				customerId: "set-plans-backdate-live-items",
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({ list: [pro, addOn] }),
				],
				actions: [
					s.billing.multiAttach({
						plans: [
							{
								productId: pro.id,
								featureQuantities: [
									{
										feature_id: TestFeature.Messages,
										quantity: PREPAID_MESSAGES,
									},
								],
							},
							{ productId: addOn.id },
						],
					}),
					s.track({
						featureId: TestFeature.Words,
						value: WORDS_USED,
						timeout: 3000,
					}),
					s.advanceTestClock({ days: 10 }),
				],
			});
		const live = await liveSubscriptionPeriod({ ctx, customerId });
		const backdatedStart = live.startMs - ms.days(10);
		const params: SetPlansParamsV0Input = {
			customer_id: customerId,
			phases: [
				{
					starts_at: backdatedStart,
					plans: [
						{
							plan_id: pro.id,
							feature_quantities: [
								{
									feature_id: TestFeature.Messages,
									quantity: PREPAID_MESSAGES,
								},
							],
						},
						{ plan_id: addOn.id },
					],
				},
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
			renewalTotal: live.billedTotal,
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			autumn: autumnV1,
			count: 2,
			latestTotal: 0,
		});

		await advanceToAnchor({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			advancedTo,
			anchorMs: live.periodEndMs,
		});
		const renewalTotal = new Decimal(live.billedTotal)
			.plus(WORDS_USAGE_TOTAL)
			.toNumber();
		await expectCustomerInvoiceCorrect({
			customerId,
			autumn: autumnV1,
			count: 3,
			latestTotal: renewalTotal,
		});
		await expectEachPeriodBilledOnce({
			ctx,
			customerId,
			periods: [
				{
					startMs: live.periodStartMs,
					endMs: addMonths(live.periodEndMs, 1).getTime(),
					total: new Decimal(live.billedTotal).plus(renewalTotal).toNumber(),
				},
			],
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans backdate live: entity plans sharing the subscription all move onto the recreated one")}`,
	async () => {
		const { pro, customerId, autumnV2_4, ctx, entities } =
			await initLiveProScenario({
				customerId: "set-plans-backdate-live-entities",
				entityCount: 2,
				advanceDays: 10,
			});
		const live = await liveSubscriptionPeriod({ ctx, customerId });
		const backdatedStart = live.startMs - ms.days(15);
		const entityIds = entities.map(({ id }) => id);

		await autumnV2_4.billing.setPlans<SetPlansParamsV0Input>({
			customer_id: customerId,
			phases: [
				{
					starts_at: backdatedStart,
					plans: entityIds.map((entityId) => ({
						plan_id: pro.id,
						entity_id: entityId,
					})),
				},
			],
		});

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
			renewalTotal: 40,
		});
		await expectEachPeriodBilledOnce({
			ctx,
			customerId,
			periods: [
				{
					startMs: live.periodStartMs,
					endMs: live.periodEndMs,
					total: live.billedTotal,
				},
			],
		});
		for (const entityId of entityIds) {
			const entityPro = await findLiveCustomerProduct({
				ctx,
				customerId,
				productId: pro.id,
				entityId,
			});
			expect(entityPro.subscription_ids).toEqual([recreated.id]);
			expect(entityPro.starts_at).toBe(backdatedStart);
		}
	},
);
