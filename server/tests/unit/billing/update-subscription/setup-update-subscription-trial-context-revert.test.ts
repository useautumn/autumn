/**
 * A revert trial's customer product rides the paused plan's Stripe subscription, so
 * its trial context must always carry onEnd "revert" — including after the trial
 * window lapses but before the expiry cron reverts it.
 *
 * Red (before):  a lapsed revert trial yields no trial context, so update writes to
 *                Stripe and the replacement customer product loses trial_ends_at.
 * Green (after): the lapsed revert trial keeps onEnd "revert" and its trial_ends_at.
 */

import { expect, test } from "bun:test";
import {
	FreeTrialDuration,
	type FullCusProduct,
	type FullProduct,
	ms,
} from "@autumn/shared";
import chalk from "chalk";
import { setupUpdateSubscriptionTrialContext } from "@/internal/billing/v2/actions/updateSubscription/setup/setupUpdateSubscriptionTrialContext";

const NOW_MS = Date.UTC(2026, 0, 15);

const fullProduct = {
	internal_id: "prod_internal",
	prices: [],
	entitlements: [],
} as unknown as FullProduct;

const revertTrialCustomerProduct = ({ trialEndsAt }: { trialEndsAt: number }) =>
	({
		on_trial_end: "revert",
		trial_ends_at: trialEndsAt,
		free_trial: null,
		customer_prices: [],
		customer_entitlements: [],
	}) as unknown as FullCusProduct;

test(`${chalk.yellowBright("revert trial context: active trial inherits onEnd revert")}`, () => {
	const trialEndsAt = NOW_MS + ms.days(7);

	const trialContext = setupUpdateSubscriptionTrialContext({
		customerProduct: revertTrialCustomerProduct({ trialEndsAt }),
		currentEpochMs: NOW_MS,
		fullProduct,
		params: {},
	});

	expect(trialContext?.onEnd).toBe("revert");
	expect(trialContext?.trialEndsAt).toBe(trialEndsAt);
});

test(`${chalk.yellowBright("revert trial context: lapsed trial still inherits onEnd revert")}`, () => {
	const trialEndsAt = NOW_MS - ms.hours(1);

	const trialContext = setupUpdateSubscriptionTrialContext({
		customerProduct: revertTrialCustomerProduct({ trialEndsAt }),
		currentEpochMs: NOW_MS,
		fullProduct,
		params: {},
	});

	expect(trialContext?.onEnd).toBe("revert");
	expect(trialContext?.trialEndsAt).toBe(trialEndsAt);
});

test(`${chalk.yellowBright("revert trial context: free_trial param without on_end keeps revert")}`, () => {
	const trialContext = setupUpdateSubscriptionTrialContext({
		customerProduct: revertTrialCustomerProduct({
			trialEndsAt: NOW_MS + ms.days(7),
		}),
		currentEpochMs: NOW_MS,
		fullProduct,
		params: {
			customize: {
				free_trial: {
					duration_length: 30,
					duration_type: FreeTrialDuration.Day,
					card_required: false,
				},
			},
		},
	});

	expect(trialContext?.onEnd).toBe("revert");
	expect(trialContext?.trialEndsAt).toBe(NOW_MS + ms.days(30));
});
