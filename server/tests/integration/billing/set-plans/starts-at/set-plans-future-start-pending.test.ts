/**
 * set_plans over a pending future start (a Scheduled row on a standalone Stripe schedule):
 * - moving it later leaves exactly one schedule, starting on the new date, and charges nothing now;
 * - starting it now activates the plan, cancels the standalone schedule and charges it once;
 * - going back to the plan the future start ended cancels the schedule, and bills the restarted
 *   plan once on top of the credit the future start gave.
 */

import { expect, test } from "bun:test";
import { CusProductStatus, type SetPlansParamsV0Input } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addDays } from "date-fns";
import {
	expectFutureStartScheduleCorrect,
	expectPendingSchedules,
	findLiveCustomerProduct,
	startsAtProducts,
} from "./utils/futureStartUtils";

const PRO_MONTHLY_PRICE = 20;

const setPlanParams = ({
	customerId,
	planId,
	startsAt,
}: {
	customerId: string;
	planId: string;
	startsAt: number | "now";
}): SetPlansParamsV0Input => ({
	customer_id: customerId,
	phases: [{ starts_at: startsAt, plans: [{ plan_id: planId }] }],
});

const initPendingProScenario = async ({
	customerId,
}: {
	customerId: string;
}) => {
	const { pro } = startsAtProducts();
	const scenario = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});
	const pendingStart = addDays(scenario.advancedTo, 7).getTime();
	await scenario.autumnV2_4.billing.setPlans(
		setPlanParams({ customerId, planId: pro.id, startsAt: pendingStart }),
	);
	const pending = await findLiveCustomerProduct({
		ctx: scenario.ctx,
		customerId,
		productId: pro.id,
	});
	const pendingSchedule = await expectFutureStartScheduleCorrect({
		ctx: scenario.ctx,
		customerProduct: pending,
		startsAt: pendingStart,
	});
	return { ...scenario, pro, pendingStart, pendingSchedule };
};

test.concurrent(
	`${chalk.yellowBright("set-plans starts_at pending: moving a future start later keeps one schedule on the new date and charges nothing")}`,
	async () => {
		const customerId = "set-plans-future-start-pending-later";
		const { pro, autumnV1, autumnV2_4, ctx, pendingStart } =
			await initPendingProScenario({ customerId });
		const laterStart = addDays(pendingStart, 7).getTime();

		await autumnV2_4.billing.setPlans(
			setPlanParams({ customerId, planId: pro.id, startsAt: laterStart }),
		);

		const moved = await findLiveCustomerProduct({
			ctx,
			customerId,
			productId: pro.id,
		});
		expect(moved.status).toBe(CusProductStatus.Scheduled);
		const schedule = await expectFutureStartScheduleCorrect({
			ctx,
			customerProduct: moved,
			startsAt: laterStart,
		});
		await expectPendingSchedules({
			ctx,
			customerId,
			scheduleIds: [schedule.id],
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			autumn: autumnV1,
			count: 0,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans starts_at pending: starting a future start now activates it, cancels its schedule and charges once")}`,
	async () => {
		const customerId = "set-plans-future-start-pending-now";
		const { pro, autumnV1, autumnV2_4, ctx, pendingSchedule } =
			await initPendingProScenario({ customerId });

		await autumnV2_4.billing.setPlans(
			setPlanParams({ customerId, planId: pro.id, startsAt: "now" }),
		);

		await expectCustomerProducts({
			customerId,
			autumn: autumnV2_4,
			active: [pro.id],
		});
		const started = await findLiveCustomerProduct({
			ctx,
			customerId,
			productId: pro.id,
		});
		expect(started.status).toBe(CusProductStatus.Active);
		expect(started.subscription_ids).toHaveLength(1);
		expect(
			(await ctx.stripeCli.subscriptionSchedules.retrieve(pendingSchedule.id))
				.status,
		).toBe("canceled");
		await expectPendingSchedules({ ctx, customerId, scheduleIds: [] });
		await expectCustomerInvoiceCorrect({
			customerId,
			autumn: autumnV1,
			count: 1,
			latestTotal: PRO_MONTHLY_PRICE,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans starts_at pending: going back to the plan a future start ended cancels the schedule and bills nothing twice")}`,
	async () => {
		const { pro, premium } = startsAtProducts();
		const { customerId, autumnV1, autumnV2_4, ctx, advancedTo } =
			await initScenario({
				customerId: "set-plans-future-start-pending-undo",
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({ list: [pro, premium] }),
				],
				actions: [s.billing.attach({ productId: pro.id })],
			});
		const futureStart = addDays(advancedTo, 7).getTime();
		const futureStartParams = setPlanParams({
			customerId,
			planId: premium.id,
			startsAt: futureStart,
		});
		const futureStartPreview =
			await autumnV2_4.billing.previewSetPlans(futureStartParams);
		await autumnV2_4.billing.setPlans(futureStartParams);
		const pendingSchedule = await expectFutureStartScheduleCorrect({
			ctx,
			customerProduct: await findLiveCustomerProduct({
				ctx,
				customerId,
				productId: premium.id,
			}),
			startsAt: futureStart,
		});

		const undoParams = setPlanParams({
			customerId,
			planId: pro.id,
			startsAt: "now",
		});
		const undoPreview = await autumnV2_4.billing.previewSetPlans(undoParams);
		expect(undoPreview.total).toBe(PRO_MONTHLY_PRICE);
		await autumnV2_4.billing.setPlans(undoParams);

		await expectCustomerProducts({
			customerId,
			autumn: autumnV2_4,
			active: [pro.id],
			notPresent: [premium.id],
		});
		expect(
			(await ctx.stripeCli.subscriptionSchedules.retrieve(pendingSchedule.id))
				.status,
		).toBe("canceled");
		await expectPendingSchedules({ ctx, customerId, scheduleIds: [] });
		await expectCustomerInvoiceCorrect({
			customerId,
			autumn: autumnV1,
			count: 3,
			latestTotal: PRO_MONTHLY_PRICE,
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			autumn: autumnV1,
			count: 3,
			invoiceIndex: 1,
			latestTotal: futureStartPreview.total,
		});
	},
);
