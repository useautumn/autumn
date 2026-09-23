/**
 * Free-only schedules must transition at phase boundaries. Stripe webhooks are the
 * phase clock, so free phases need a $0 placeholder on the free plan's own product.
 *
 * Red (current):  Free A → Free B never transitions; B stays scheduled forever.
 * Green (after):  at B's start, A is gone and B is active. The placeholder uses the free
 *                 plan's own Stripe product, created once and reused, including when a
 *                 phase customizes the free plan into a paid one.
 */

import { expect, test } from "bun:test";
import type {
	ApiCustomerV5,
	CreateScheduleParamsV0Input,
} from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
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
	`${chalk.yellowBright("create-schedule free only: free → free transitions at the phase boundary")}`,
	async () => {
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
				customerId: "sched-free-to-free",
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({ list: [freeA, freeB], createInStripe: false }),
				],
				actions: [],
			});

		const freeBStartsAt = addMonths(advancedTo, 1).getTime();
		await autumnV2_3.billing.createSchedule<CreateScheduleParamsV0Input>({
			customer_id: customerId,
			phases: [
				{ starts_at: advancedTo, plans: [{ plan_id: freeA.id }] },
				{ starts_at: freeBStartsAt, plans: [{ plan_id: freeB.id }] },
			],
		});

		await expectCustomerProducts({
			customer: await autumnV2_3.customers.get<ApiCustomerV5>(customerId),
			active: [freeA.id],
			scheduled: [freeB.id],
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
			notPresent: [freeA.id],
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("create-schedule free only: lazily creates one Stripe product per free plan and reuses it")}`,
	async () => {
		const freeA = products.base({
			id: "free-a",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const freeB = products.base({
			id: "free-b",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});
		const otherCustomerId = "sched-free-product-2";

		const { customerId, autumnV2_3, ctx, advancedTo } = await initScenario({
			customerId: "sched-free-product",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.otherCustomers([{ id: otherCustomerId, paymentMethod: "success" }]),
				s.products({ list: [freeA, freeB], createInStripe: false }),
			],
			actions: [],
		});

		// createInStripe: false mirrors live, where plans aren't pushed to Stripe on creation.
		expect(await getProductStripeId({ ctx, productId: freeA.id })).toBeNull();

		// Concurrent schedules must still converge on a single Stripe product.
		const freeBStartsAt = addMonths(advancedTo, 1).getTime();
		await Promise.all(
			[customerId, otherCustomerId].map((id) =>
				autumnV2_3.billing.createSchedule<CreateScheduleParamsV0Input>({
					customer_id: id,
					phases: [
						{ starts_at: advancedTo, plans: [{ plan_id: freeA.id }] },
						{ starts_at: freeBStartsAt, plans: [{ plan_id: freeB.id }] },
					],
				}),
			),
		);

		const freeAStripeId = await getProductStripeId({
			ctx,
			productId: freeA.id,
		});
		expect(freeAStripeId).not.toBeNull();
		// The final free phase needs no placeholder, so it creates nothing.
		expect(await getProductStripeId({ ctx, productId: freeB.id })).toBeNull();

		for (const id of [customerId, otherCustomerId]) {
			const phasePrices = await getStripeSchedulePhasePrices({
				ctx,
				customerId: id,
			});
			expect(phasePrices).toEqual([
				{ productId: freeAStripeId!, unitAmount: 0, active: false },
			]);
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("create-schedule free only: a paid customization shares the free plan's Stripe product")}`,
	async () => {
		const freeA = products.base({
			id: "free-a",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { customerId, autumnV2_3, ctx, advancedTo } = await initScenario({
			customerId: "sched-free-customized",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [freeA], createInStripe: false }),
			],
			actions: [],
		});

		await autumnV2_3.billing.createSchedule<CreateScheduleParamsV0Input>({
			customer_id: customerId,
			phases: [
				{ starts_at: advancedTo, plans: [{ plan_id: freeA.id }] },
				{
					starts_at: addMonths(advancedTo, 1).getTime(),
					plans: [
						{
							plan_id: freeA.id,
							customize: { price: itemsV2.monthlyPrice({ amount: 20 }) },
						},
					],
				},
			],
		});

		const freeAStripeId = await getProductStripeId({
			ctx,
			productId: freeA.id,
		});
		expect(freeAStripeId).not.toBeNull();

		const phasePrices = await getStripeSchedulePhasePrices({ ctx, customerId });
		expect(phasePrices.map((price) => price.productId)).toEqual([
			freeAStripeId!,
			freeAStripeId!,
		]);
		expect(phasePrices.map((price) => price.unitAmount)).toEqual([0, 2000]);
	},
);
