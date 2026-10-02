/**
 * set_plans unscheduled_plans with a future phases[0].starts_at run from now, not from the start:
 * - a running add-on keeps its row and subscription while the main plan ends now and its successor waits;
 * - a new add-on is attached and invoiced now while the phase plan waits for the start.
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
	findLiveCustomerProduct,
	startsAtProducts,
} from "./utils/futureStartUtils";

test.concurrent(
	`${chalk.yellowBright("set-plans starts_at: a running ongoing add-on keeps running while the first phase starts later")}`,
	async () => {
		const { pro, premium, addOn } = startsAtProducts();
		const { customerId, autumnV2_2, ctx, advancedTo } = await initScenario({
			customerId: "set-plans-future-start-ongoing-running",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium, addOn] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.billing.attach({ productId: addOn.id }),
			],
		});
		const runningAddOn = await findLiveCustomerProduct({
			ctx,
			customerId,
			productId: addOn.id,
		});
		const startsAt = addDays(advancedTo, 7).getTime();

		await autumnV2_2.billing.setPlans<SetPlansParamsV0Input>({
			customer_id: customerId,
			phases: [{ starts_at: startsAt, plans: [{ plan_id: premium.id }] }],
			unscheduled_plans: [{ plan_id: addOn.id }],
		});

		await expectCustomerProducts({
			customerId,
			autumn: autumnV2_2,
			active: [addOn.id],
			scheduled: [premium.id],
			notPresent: [pro.id],
		});
		const keptAddOn = await findLiveCustomerProduct({
			ctx,
			customerId,
			productId: addOn.id,
		});
		expect(keptAddOn.id).toBe(runningAddOn.id);
		expect(keptAddOn.subscription_ids).toEqual(runningAddOn.subscription_ids);

		const scheduledPremium = await findLiveCustomerProduct({
			ctx,
			customerId,
			productId: premium.id,
		});
		const schedule = await expectFutureStartScheduleCorrect({
			ctx,
			customerProduct: scheduledPremium,
			startsAt,
			createsSubscriptionLater: false,
		});
		expect(schedule.subscription).toBe(runningAddOn.subscription_ids![0]!);
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans starts_at: a new ongoing add-on is attached and invoiced now while the first phase starts later")}`,
	async () => {
		const { pro, addOn } = startsAtProducts();
		const { customerId, autumnV1, autumnV2_2, ctx, advancedTo } =
			await initScenario({
				customerId: "set-plans-future-start-ongoing-new",
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({ list: [pro, addOn] }),
				],
				actions: [],
			});
		const startsAt = addDays(advancedTo, 7).getTime();
		const params: SetPlansParamsV0Input = {
			customer_id: customerId,
			phases: [{ starts_at: startsAt, plans: [{ plan_id: pro.id }] }],
			unscheduled_plans: [{ plan_id: addOn.id }],
		};

		const preview = await autumnV2_2.billing.previewSetPlans(params);
		expect(preview.total).toBeGreaterThan(0);

		await autumnV2_2.billing.setPlans(params);

		await expectCustomerProducts({
			customerId,
			autumn: autumnV2_2,
			active: [addOn.id],
			scheduled: [pro.id],
		});
		const attachedAddOn = await findLiveCustomerProduct({
			ctx,
			customerId,
			productId: addOn.id,
		});
		expect(attachedAddOn.status).toBe(CusProductStatus.Active);
		await expectCustomerInvoiceCorrect({
			customerId,
			autumn: autumnV1,
			count: 1,
			latestTotal: preview.total,
		});
	},
);
