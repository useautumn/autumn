/**
 * Transitions onto and between plans with `config.anchor_to_month_start`.
 *
 * Contract:
 *   explicit billing_cycle_anchor "now" → the explicit param wins over the flag
 *   free (flag off) → paid (flagged)    → the new subscription is anchored to the 1st
 *   paid (flagged)  → paid (flagged)    → the existing anchor on the 1st is kept
 *   paid (20th)     → paid (flagged)    → charged as an ordinary upgrade now; the cycle
 *                                         resets to the 1st when it arrives
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	type AttachParamsV1Input,
	msToSeconds,
	secondsToMs,
} from "@autumn/shared";
import { advanceToAnchor } from "@tests/integration/billing/utils/advanceUtils/advanceToAnchor";
import { getStripeSubscription } from "@tests/integration/billing/utils/stripeSubscriptionUtils";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import globalCtx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addMonths } from "date-fns";
import {
	anchoredToMonthStart,
	expectStripeSubscriptionAnchorCorrect,
	nextMonthStartMs,
} from "./utils/anchorToMonthStartUtils";

const ANCHOR_NOW_TOLERANCE_MS = 60_000;
// Pinned: a cycle started any time on a 1st already counts as anchored.
const PAID_ON_THE_20TH_MS = Date.UTC(2027, 2, 1, 11, 14);

test.concurrent(
	`${chalk.yellowBright("anchor-to-month-start transitions 1: explicit billing_cycle_anchor 'now' wins over the flag")}`,
	async () => {
		const customerId = "anchor-month-explicit-now";
		const pro = anchoredToMonthStart(
			products.pro({
				id: "pro",
				items: [items.monthlyMessages({ includedUsage: 100 })],
			}),
		);

		const { autumnV2_3, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
			billing_cycle_anchor: "now",
		});

		const { subscription } = await getStripeSubscription({ customerId });
		const anchorMs = secondsToMs(subscription.billing_cycle_anchor);
		expect(Math.abs(anchorMs - advancedTo)).toBeLessThan(
			ANCHOR_NOW_TOLERANCE_MS,
		);
	},
);

test.concurrent(
	`${chalk.yellowBright("anchor-to-month-start transitions 2: free -> flagged paid anchors the new subscription to the 1st")}`,
	async () => {
		const customerId = "anchor-month-free-to-paid";
		const free = products.base({
			id: "free",
			items: [items.monthlyMessages({ includedUsage: 50 })],
		});
		const pro = anchoredToMonthStart(
			products.pro({
				id: "pro",
				items: [items.monthlyMessages({ includedUsage: 100 })],
			}),
		);

		const { autumnV2_3, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [free, pro] }),
			],
			actions: [
				s.billing.attach({ productId: free.id }),
				s.advanceTestClock({ days: 3 }),
			],
		});

		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
		});

		await expectStripeSubscriptionAnchorCorrect({
			customerId,
			anchorMs: nextMonthStartMs({ fromMs: advancedTo }),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("anchor-to-month-start transitions 3: flagged paid -> flagged paid keeps the 1st")}`,
	async () => {
		const customerId = "anchor-month-paid-upgrade";
		const pro = anchoredToMonthStart(
			products.pro({
				id: "pro",
				items: [items.monthlyMessages({ includedUsage: 100 })],
			}),
		);
		const premium = anchoredToMonthStart(
			products.premium({
				id: "premium",
				items: [items.monthlyMessages({ includedUsage: 500 })],
			}),
		);

		const { autumnV2_3, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.advanceTestClock({ days: 2 }),
			],
		});
		const monthStartMs = nextMonthStartMs({ fromMs: advancedTo });

		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: premium.id,
		});

		await expectStripeSubscriptionAnchorCorrect({
			customerId,
			anchorMs: monthStartMs,
		});
	},
);

test(`${chalk.yellowBright("anchor-to-month-start transitions 4: paid on the 20th -> flagged paid schedules a reset to the 1st")}`, async () => {
	const customerId = "anchor-month-transition-scheduled-reset";
	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const premium = anchoredToMonthStart(
		products.premium({
			id: "premium",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		}),
	);

	const testClock = await globalCtx.stripeCli.testHelpers.testClocks.create({
		frozen_time: msToSeconds(PAID_ON_THE_20TH_MS),
	});
	const advancedTo = PAID_ON_THE_20TH_MS;

	const { autumnV2_3, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({
				testClock: false,
				paymentMethod: "success",
				stripeCustomerOverrides: { test_clock: testClock.id },
			}),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});
	const { subscription: subscriptionBefore } = await getStripeSubscription({
		customerId,
	});
	const originalAnchorMs = secondsToMs(subscriptionBefore.billing_cycle_anchor);
	const monthStartMs = nextMonthStartMs({ fromMs: advancedTo });

	const upgradeParams: AttachParamsV1Input = {
		customer_id: customerId,
		plan_id: premium.id,
	};
	const preview =
		await autumnV2_3.billing.previewAttach<AttachParamsV1Input>(upgradeParams);
	// Ordinary upgrade diff for the current cycle: the anchor moves later.
	expect(preview.total).toBe(30);
	await autumnV2_3.billing.attach<AttachParamsV1Input>(upgradeParams);

	await expectStripeSubscriptionAnchorCorrect({
		customerId,
		anchorMs: originalAnchorMs,
	});
	await expectBalanceCorrect({
		customerId,
		autumn: autumnV2_3,
		featureId: TestFeature.Messages,
		remaining: 500,
		planId: premium.id,
		nextResetAt: monthStartMs,
		toleranceMs: 1000,
	});

	await advanceToAnchor({
		stripeCli: ctx.stripeCli,
		testClockId: testClock.id,
		advancedTo,
		anchorMs: monthStartMs,
	});

	await expectStripeSubscriptionAnchorCorrect({
		customerId,
		anchorMs: monthStartMs,
	});
	const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 500,
		planId: premium.id,
		nextResetAt: addMonths(monthStartMs, 1).getTime(),
		toleranceMs: 1000,
	});
});
