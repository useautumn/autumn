/**
 * set_plans with a future phases[0].starts_at:
 * - nothing live: rows are Scheduled on a Stripe schedule that starts that day, nothing is invoiced now,
 *   the preview's next event is the start, and the subscription Stripe creates at the start activates them;
 * - a live plan ends now with a credit equal to the preview, its subscription is cancelled,
 *   and the new plan waits for the start;
 * - a trial, or a free plan nothing in Stripe would start, is rejected.
 */

import { expect, test } from "bun:test";
import { CusProductStatus, type SetPlansParamsV0Input } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { getSubscriptionId } from "@tests/integration/billing/utils/stripe/getSubscriptionId";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addDays } from "date-fns";
import {
	activateFutureStart,
	expectFutureStartScheduleCorrect,
	findLiveCustomerProduct,
} from "./utils/futureStartUtils";

test.concurrent(
	`${chalk.yellowBright("set-plans starts_at: with nothing live, a future start schedules the plan and activates it on the start")}`,
	async () => {
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { customerId, autumnV1, autumnV2_2, ctx, advancedTo, testClockId } =
			await initScenario({
				customerId: "set-plans-future-start-new",
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({ list: [pro] }),
				],
				actions: [],
			});
		const startsAt = addDays(advancedTo, 7).getTime();
		const params: SetPlansParamsV0Input = {
			customer_id: customerId,
			phases: [{ starts_at: startsAt, plans: [{ plan_id: pro.id }] }],
		};

		const preview = await autumnV2_2.billing.previewSetPlans(params);
		expect(preview.total).toBe(0);
		expect(preview.next_cycle?.starts_at).toBe(startsAt);
		expect(preview.next_cycle?.total).toBe(20);
		expect(preview.phases[0]?.starts_now).toBe(false);
		expect(preview.warnings.map(({ type }) => type)).toContain(
			"billing_starts_later",
		);

		await autumnV2_2.billing.setPlans(params);

		await expectCustomerProducts({
			customerId,
			autumn: autumnV2_2,
			scheduled: [pro.id],
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			autumn: autumnV1,
			count: 0,
		});
		const scheduled = await findLiveCustomerProduct({
			ctx,
			customerId,
			productId: pro.id,
		});
		expect(scheduled.status).toBe(CusProductStatus.Scheduled);
		const schedule = await expectFutureStartScheduleCorrect({
			ctx,
			customerProduct: scheduled,
			startsAt,
		});

		const stripeSubscriptionId = await activateFutureStart({
			ctx,
			customerId,
			testClockId: testClockId!,
			scheduleId: schedule.id,
			startsAt,
		});

		const activated = await findLiveCustomerProduct({
			ctx,
			customerId,
			productId: pro.id,
		});
		expect(activated.status).toBe(CusProductStatus.Active);
		expect(activated.subscription_ids).toEqual([stripeSubscriptionId]);
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans starts_at: a live plan ends now with the previewed credit, and its subscription is cancelled")}`,
	async () => {
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const premium = products.premium({
			id: "premium",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});
		const { customerId, autumnV1, autumnV2_2, ctx, advancedTo } =
			await initScenario({
				customerId: "set-plans-future-start-live",
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({ list: [pro, premium] }),
				],
				actions: [s.billing.attach({ productId: pro.id })],
			});
		const liveSubscriptionId = await getSubscriptionId({
			ctx,
			customerId,
			productId: pro.id,
		});
		const startsAt = addDays(advancedTo, 10).getTime();
		const params: SetPlansParamsV0Input = {
			customer_id: customerId,
			phases: [{ starts_at: startsAt, plans: [{ plan_id: premium.id }] }],
		};

		const preview = await autumnV2_2.billing.previewSetPlans(params);
		expect(preview.total).toBeLessThan(0);

		await autumnV2_2.billing.setPlans(params);

		await expectCustomerProducts({
			customerId,
			autumn: autumnV2_2,
			scheduled: [premium.id],
			notPresent: [pro.id],
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			autumn: autumnV1,
			count: 2,
			latestTotal: preview.total,
		});
		await expectFutureStartScheduleCorrect({
			ctx,
			customerProduct: await findLiveCustomerProduct({
				ctx,
				customerId,
				productId: premium.id,
			}),
			startsAt,
		});
		const liveSubscription =
			await ctx.stripeCli.subscriptions.retrieve(liveSubscriptionId);
		expect(liveSubscription.status).toBe("canceled");
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans starts_at: a future start rejects a trial, and a free plan nothing in Stripe would start")}`,
	async () => {
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const free = products.base({
			id: "free",
			items: [items.monthlyMessages({ includedUsage: 10 })],
		});
		const { customerId, autumnV2_2, advancedTo } = await initScenario({
			customerId: "set-plans-future-start-rejects",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, free] }),
			],
			actions: [],
		});
		const startsAt = addDays(advancedTo, 7).getTime();

		await expectAutumnError({
			errMessage: "A free trial can't start on a later date",
			func: () =>
				autumnV2_2.billing.setPlans({
					customer_id: customerId,
					free_trial: { duration_length: 7, duration_type: "day" },
					phases: [{ starts_at: startsAt, plans: [{ plan_id: pro.id }] }],
				}),
		});
		await expectAutumnError({
			errMessage: "can't start on a later date",
			func: () =>
				autumnV2_2.billing.setPlans({
					customer_id: customerId,
					phases: [{ starts_at: startsAt, plans: [{ plan_id: free.id }] }],
				}),
		});
		await expectCustomerProducts({
			customerId,
			autumn: autumnV2_2,
			notPresent: [pro.id, free.id],
		});
	},
);
