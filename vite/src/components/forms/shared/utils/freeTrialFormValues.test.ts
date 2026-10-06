import { describe, expect, test } from "bun:test";
import { FreeTrialDuration } from "@autumn/shared";
import {
	DEFAULT_TRIAL_LENGTH,
	DISABLED_FREE_TRIAL_FORM_VALUES,
	freeTrialFormValuesToParams,
	freeTrialToFormValues,
	toggledFreeTrialFormValues,
} from "./freeTrialFormValues";

const FOURTEEN_DAY_TRIAL = {
	trialEnabled: true,
	trialLength: 14,
	trialDuration: FreeTrialDuration.Day,
	trialCardRequired: false,
};

describe("toggledFreeTrialFormValues", () => {
	test("switching on seeds the catalog trial's length and unit", () => {
		expect(
			toggledFreeTrialFormValues({
				enabled: true,
				trialLength: null,
				catalogFreeTrial: { length: 2, duration: FreeTrialDuration.Month },
			}),
		).toEqual({
			trialEnabled: true,
			trialLength: 2,
			trialDuration: FreeTrialDuration.Month,
		});
	});

	test("switching on without a catalog trial seeds the default length", () => {
		expect(
			toggledFreeTrialFormValues({ enabled: true, trialLength: null }),
		).toEqual({ trialEnabled: true, trialLength: DEFAULT_TRIAL_LENGTH });
	});

	test("switching on keeps a length the user already typed", () => {
		expect(
			toggledFreeTrialFormValues({
				enabled: true,
				trialLength: 30,
				catalogFreeTrial: { length: 2, duration: FreeTrialDuration.Month },
			}),
		).toEqual({ trialEnabled: true });
	});

	test("switching off clears the length", () => {
		expect(
			toggledFreeTrialFormValues({ enabled: false, trialLength: 14 }),
		).toEqual({ trialEnabled: false, trialLength: null });
	});
});

describe("freeTrialFormValuesToParams", () => {
	test("maps an enabled row to the multi-plan free_trial shape", () => {
		expect(freeTrialFormValuesToParams(FOURTEEN_DAY_TRIAL)).toEqual({
			duration_length: 14,
			duration_type: FreeTrialDuration.Day,
			card_required: false,
		});
	});

	test("keeps a revert on_end and drops the default bill", () => {
		expect(
			freeTrialFormValuesToParams({
				...FOURTEEN_DAY_TRIAL,
				trialOnEnd: "revert",
			}),
		).toMatchObject({ on_end: "revert" });
		expect(
			freeTrialFormValuesToParams({
				...FOURTEEN_DAY_TRIAL,
				trialOnEnd: "bill",
			}),
		).not.toHaveProperty("on_end");
	});

	test("omits a disabled or empty row", () => {
		expect(
			freeTrialFormValuesToParams(DISABLED_FREE_TRIAL_FORM_VALUES),
		).toBeUndefined();
		expect(
			freeTrialFormValuesToParams({ ...FOURTEEN_DAY_TRIAL, trialLength: null }),
		).toBeUndefined();
	});
});

test("freeTrialToFormValues switches the row on with the trial's values", () => {
	expect(
		freeTrialToFormValues({
			freeTrial: {
				length: 14,
				duration: FreeTrialDuration.Day,
				card_required: false,
			},
		}),
	).toEqual(FOURTEEN_DAY_TRIAL);
});
