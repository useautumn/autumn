/**
 * Downgrades and cancels onto free plans with `config.anchor_to_month_start`.
 *
 * Contract:
 *   paid → flagged free (end of cycle) → free starts when the paid cycle ends and keeps that
 *                                         date (a scheduled switch follows the outgoing cycle)
 *   cancel at end of cycle             → flagged default free resets on the 1st after it starts
 *   cancel immediately                 → flagged default free resets on the next 1st
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	type AttachParamsV1Input,
	secondsToMs,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { advanceToAnchor } from "@tests/integration/billing/utils/advanceUtils/advanceToAnchor";
import { getStripeSubscription } from "@tests/integration/billing/utils/stripeSubscriptionUtils";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addMonths } from "date-fns";
import {
	anchoredToMonthStart,
	nextMonthStartMs,
} from "./utils/anchorToMonthStartUtils";

const EXACT_MS = 1000;

const getPaidCycleEndMs = async ({ customerId }: { customerId: string }) => {
	const { subscription } = await getStripeSubscription({ customerId });
	return secondsToMs(subscription.items.data[0]!.current_period_end);
};

const setupPaidWithFlaggedFree = ({
	customerId,
	freeIsDefault,
}: {
	customerId: string;
	freeIsDefault: boolean;
}) => {
	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});
	const free = anchoredToMonthStart(
		products.base({
			id: "free",
			isDefault: freeIsDefault,
			items: [items.monthlyMessages({ includedUsage: 100 })],
		}),
	);
	return {
		pro,
		free,
		scenario: initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, free] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.advanceTestClock({ days: 3 }),
			],
		}),
	};
};

test.concurrent(
	`${chalk.yellowBright("anchor-to-month-start downgrades 1: paid -> flagged free starts at cycle end and keeps that date")}`,
	async () => {
		const customerId = "anchor-month-downgrade-free";
		const { free, scenario } = setupPaidWithFlaggedFree({
			customerId,
			freeIsDefault: false,
		});
		const { autumnV2_3, ctx, advancedTo, testClockId } = await scenario;
		const cycleEndMs = await getPaidCycleEndMs({ customerId });

		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: free.id,
		});

		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		const scheduledFree = customer.subscriptions?.find(
			(subscription) => subscription.plan_id === free.id,
		);
		expect(scheduledFree?.status).toBe("scheduled");
		expect(
			Math.abs((scheduledFree?.started_at ?? 0) - cycleEndMs),
		).toBeLessThan(EXACT_MS);

		await advanceToAnchor({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			advancedTo,
			anchorMs: cycleEndMs,
		});

		await expectBalanceCorrect({
			customerId,
			autumn: autumnV2_3,
			featureId: TestFeature.Messages,
			remaining: 100,
			planId: free.id,
			nextResetAt: addMonths(cycleEndMs, 1).getTime(),
			toleranceMs: EXACT_MS,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("anchor-to-month-start downgrades 2: cancel at end of cycle -> flagged default free resets on the 1st")}`,
	async () => {
		const customerId = "anchor-month-cancel-eoc";
		const { pro, free, scenario } = setupPaidWithFlaggedFree({
			customerId,
			freeIsDefault: true,
		});
		const { autumnV2_3, ctx, advancedTo, testClockId } = await scenario;
		const cycleEndMs = await getPaidCycleEndMs({ customerId });

		await autumnV2_3.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: pro.id,
			cancel_action: "cancel_end_of_cycle",
		});
		await advanceToAnchor({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			advancedTo,
			anchorMs: cycleEndMs,
		});

		await expectBalanceCorrect({
			customerId,
			autumn: autumnV2_3,
			featureId: TestFeature.Messages,
			remaining: 100,
			planId: free.id,
			nextResetAt: nextMonthStartMs({ fromMs: cycleEndMs }),
			toleranceMs: EXACT_MS,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("anchor-to-month-start downgrades 3: cancel immediately -> flagged default free resets on the next 1st")}`,
	async () => {
		const customerId = "anchor-month-cancel-now";
		const { pro, free, scenario } = setupPaidWithFlaggedFree({
			customerId,
			freeIsDefault: true,
		});
		const { autumnV2_3, advancedTo } = await scenario;

		await autumnV2_3.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: pro.id,
			cancel_action: "cancel_immediately",
		});

		await expectBalanceCorrect({
			customerId,
			autumn: autumnV2_3,
			featureId: TestFeature.Messages,
			remaining: 100,
			planId: free.id,
			nextResetAt: nextMonthStartMs({ fromMs: advancedTo }),
			toleranceMs: EXACT_MS,
		});
	},
);
