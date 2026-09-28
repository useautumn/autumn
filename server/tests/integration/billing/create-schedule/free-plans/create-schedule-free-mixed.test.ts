/**
 * Mixed schedules keep Stripe as the phase clock through free stretches via a $0
 * placeholder, which must sit on the free plan's own Stripe product.
 *
 * Red (current):  the placeholder borrows the paid plan's Stripe product.
 * Green (after):  the placeholder uses the free plan's product, and both free
 *                 boundaries after the paid phase still transition.
 */

import { expect, test } from "bun:test";
import type { CreateScheduleParamsV0Input } from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addHours, addMonths } from "date-fns";
import {
	getProductStripeId,
	getStripeSchedulePhasePrices,
} from "../utils/createScheduleTestHelpers";

test.concurrent(
	`${chalk.yellowBright("create-schedule free mixed: paid → free → free transitions on the free plan's product")}`,
	async () => {
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 1000 })],
		});
		const freeA = products.base({
			id: "free-a",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const freeB = products.base({
			id: "free-b",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const { customerId, autumnV2_3, ctx, testClockId, advancedTo } =
			await initScenario({
				customerId: "sched-paid-free-free",
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({ list: [pro, freeA, freeB], createInStripe: false }),
				],
				actions: [],
			});

		const freeAStartsAt = addMonths(advancedTo, 1).getTime();
		const freeBStartsAt = addMonths(advancedTo, 2).getTime();
		await autumnV2_3.billing.createSchedule<CreateScheduleParamsV0Input>({
			customer_id: customerId,
			phases: [
				{ starts_at: advancedTo, plans: [{ plan_id: pro.id }] },
				{ starts_at: freeAStartsAt, plans: [{ plan_id: freeA.id }] },
				{ starts_at: freeBStartsAt, plans: [{ plan_id: freeB.id }] },
			],
		});

		const placeholder = (
			await getStripeSchedulePhasePrices({ ctx, customerId })
		).find((price) => price.unitAmount === 0);
		expect(placeholder?.productId).toBe(
			(await getProductStripeId({ ctx, productId: freeA.id }))!,
		);

		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			advanceTo: addHours(freeAStartsAt, 1).getTime(),
			waitForSeconds: 30,
		});
		await expectCustomerProducts({
			customerId,
			autumn: autumnV2_3,
			active: [freeA.id],
			scheduled: [freeB.id],
			notPresent: [pro.id],
		});

		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			advanceTo: addHours(freeBStartsAt, 1).getTime(),
			waitForSeconds: 30,
		});
		await expectCustomerProducts({
			customerId,
			autumn: autumnV2_3,
			active: [freeB.id],
			notPresent: [freeA.id, pro.id],
		});
	},
);
