/**
 * What a future phases[0].starts_at does to the plans the customer has now:
 * - an auto-attached free default plan keeps running until the start, then the paid plan replaces it;
 * - a plan canceling at period end still ends now, credited its unused time exactly once.
 */

import { expect, test } from "bun:test";
import { CusProductStatus, type SetPlansParamsV0Input } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addDays } from "date-fns";
import { Decimal } from "decimal.js";
import {
	expectEachPeriodBilledOnce,
	expectedRestOfCycle,
	liveSubscriptionPeriod,
} from "./backdate-live/utils/backdateLiveUtils";
import {
	activateFutureStart,
	expectFutureStartScheduleCorrect,
	findLiveCustomerProduct,
	startsAtProducts,
	testClockNowMs,
} from "./utils/futureStartUtils";

const PRO_MONTHLY_PRICE = 20;

test.concurrent(
	`${chalk.yellowBright("set-plans starts_at: a free default plan runs until the future start, then the paid plan replaces it")}`,
	async () => {
		const { pro } = startsAtProducts();
		const free = products.base({
			id: "free",
			isDefault: true,
			items: [items.monthlyMessages({ includedUsage: 10 })],
		});
		const { customerId, autumnV1, autumnV2_4, ctx, advancedTo, testClockId } =
			await initScenario({
				customerId: "set-plans-future-start-free-default",
				setup: [
					s.products({ list: [free, pro] }),
					s.customer({ paymentMethod: "success", withDefault: true }),
				],
				actions: [],
			});
		await expectCustomerProducts({
			customerId,
			autumn: autumnV2_4,
			active: [free.id],
		});
		const startsAt = addDays(advancedTo, 7).getTime();

		await autumnV2_4.billing.setPlans<SetPlansParamsV0Input>({
			customer_id: customerId,
			phases: [{ starts_at: startsAt, plans: [{ plan_id: pro.id }] }],
		});

		await expectCustomerProducts({
			customerId,
			autumn: autumnV2_4,
			active: [free.id],
			scheduled: [pro.id],
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			autumn: autumnV1,
			count: 0,
		});
		const schedule = await expectFutureStartScheduleCorrect({
			ctx,
			customerProduct: await findLiveCustomerProduct({
				ctx,
				customerId,
				productId: pro.id,
			}),
			startsAt,
		});

		await activateFutureStart({
			ctx,
			customerId,
			testClockId: testClockId!,
			scheduleId: schedule.id,
			startsAt,
		});

		await expectCustomerProducts({
			customerId,
			autumn: autumnV2_4,
			active: [pro.id],
			notPresent: [free.id],
		});
		const activated = await findLiveCustomerProduct({
			ctx,
			customerId,
			productId: pro.id,
		});
		expect(activated.status).toBe(CusProductStatus.Active);
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans starts_at: a plan canceling at period end ends now, credited its unused time once")}`,
	async () => {
		const { pro, premium } = startsAtProducts();
		const { customerId, autumnV1, autumnV2_4, ctx, testClockId } =
			await initScenario({
				customerId: "set-plans-future-start-canceling",
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({ list: [pro, premium] }),
				],
				actions: [
					s.billing.attach({ productId: pro.id }),
					s.updateSubscription({
						productId: pro.id,
						cancelAction: "cancel_end_of_cycle",
					}),
					s.advanceTestClock({ days: 10 }),
				],
			});
		const live = await liveSubscriptionPeriod({ ctx, customerId });
		const nowMs = await testClockNowMs({ ctx, testClockId: testClockId! });
		const unusedCredit = new Decimal(
			expectedRestOfCycle({
				monthlyPrice: PRO_MONTHLY_PRICE,
				nowMs,
				cycleStartMs: live.periodStartMs,
				cycleEndMs: live.periodEndMs,
			}),
		)
			.neg()
			.toDP(2)
			.toNumber();
		const startsAt = addDays(nowMs, 7).getTime();
		const params: SetPlansParamsV0Input = {
			customer_id: customerId,
			phases: [{ starts_at: startsAt, plans: [{ plan_id: premium.id }] }],
		};

		const preview = await autumnV2_4.billing.previewSetPlans(params);
		await autumnV2_4.billing.setPlans(params);

		await expectCustomerProducts({
			customerId,
			autumn: autumnV2_4,
			scheduled: [premium.id],
			notPresent: [pro.id],
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			autumn: autumnV1,
			count: 2,
			latestTotal: preview.total,
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			autumn: autumnV1,
			count: 2,
			latestTotal: unusedCredit,
		});
		expect(
			(await ctx.stripeCli.subscriptions.retrieve(live.subscription.id)).status,
		).toBe("canceled");
		await expectEachPeriodBilledOnce({
			ctx,
			customerId,
			periods: [
				{
					startMs: live.periodStartMs,
					endMs: live.periodEndMs,
					total: new Decimal(PRO_MONTHLY_PRICE).plus(preview.total).toNumber(),
				},
			],
		});
	},
);
