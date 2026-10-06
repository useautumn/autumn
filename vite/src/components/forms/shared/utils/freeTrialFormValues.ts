import {
	type FreeTrial,
	FreeTrialDuration,
	type FreeTrialParamsV1,
	type TrialOnEnd,
} from "@autumn/shared";
import { z } from "zod/v4";
import { getFreeTrial } from "@/components/forms/update-subscription-v2/utils/getFreeTrial";

export const DEFAULT_TRIAL_LENGTH = 7;

export const FreeTrialFormFieldsSchema = z.object({
	trialLength: z.number().positive().nullable(),
	trialDuration: z.enum(FreeTrialDuration),
	trialEnabled: z.boolean(),
	trialCardRequired: z.boolean(),
});

export type FreeTrialFormValues = z.infer<typeof FreeTrialFormFieldsSchema>;

type FreeTrialConfig = Pick<FreeTrial, "length" | "duration" | "card_required">;

export const DISABLED_FREE_TRIAL_FORM_VALUES: FreeTrialFormValues = {
	trialLength: null,
	trialDuration: FreeTrialDuration.Day,
	trialEnabled: false,
	trialCardRequired: true,
};

/** A row switched on with an existing trial's length, unit and card requirement. */
export const freeTrialToFormValues = ({
	freeTrial,
}: {
	freeTrial: FreeTrialConfig;
}): FreeTrialFormValues => ({
	trialEnabled: true,
	trialLength: Number(freeTrial.length),
	trialDuration: freeTrial.duration as FreeTrialDuration,
	trialCardRequired: Boolean(freeTrial.card_required),
});

export const pickFreeTrialFormValues = ({
	trialEnabled,
	trialLength,
	trialDuration,
	trialCardRequired,
}: FreeTrialFormValues): FreeTrialFormValues => ({
	trialEnabled,
	trialLength,
	trialDuration,
	trialCardRequired,
});

export const isSameFreeTrialFormValues = ({
	left,
	right,
}: {
	left: FreeTrialFormValues;
	right: FreeTrialFormValues;
}) =>
	left.trialEnabled === right.trialEnabled &&
	left.trialLength === right.trialLength &&
	left.trialDuration === right.trialDuration &&
	left.trialCardRequired === right.trialCardRequired;

/** Switching on keeps a typed length, else seeds the catalog trial or the default length. */
export const toggledFreeTrialFormValues = ({
	enabled,
	trialLength,
	catalogFreeTrial,
}: {
	enabled: boolean;
	trialLength: number | null;
	catalogFreeTrial?: Pick<FreeTrial, "length" | "duration"> | null;
}): Partial<FreeTrialFormValues> => {
	if (!enabled) return { trialEnabled: false, trialLength: null };
	if (trialLength) return { trialEnabled: true };
	if (!catalogFreeTrial) {
		return { trialEnabled: true, trialLength: DEFAULT_TRIAL_LENGTH };
	}
	return {
		trialEnabled: true,
		trialLength: Number(catalogFreeTrial.length),
		...(catalogFreeTrial.duration && {
			trialDuration: catalogFreeTrial.duration as FreeTrialDuration,
		}),
	};
};

/** The `free_trial` param shape shared by multi-plan billing requests. */
export const freeTrialFormValuesToParams = ({
	trialEnabled,
	trialLength,
	trialDuration,
	trialCardRequired,
	trialOnEnd,
}: FreeTrialFormValues & {
	trialOnEnd?: TrialOnEnd;
}): FreeTrialParamsV1 | undefined => {
	const freeTrial = getFreeTrial({
		removeTrial: false,
		trialLength,
		trialDuration,
		trialEnabled,
		trialCardRequired,
		trialOnEnd,
	});
	if (!freeTrial) return undefined;
	return {
		duration_length: freeTrial.length,
		duration_type: freeTrial.duration,
		card_required: freeTrial.card_required,
		...(freeTrial.on_end ? { on_end: freeTrial.on_end } : {}),
	};
};
