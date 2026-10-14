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
