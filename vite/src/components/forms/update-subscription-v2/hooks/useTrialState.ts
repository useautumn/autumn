import {
	FreeTrialDuration,
	type FullCusProduct,
	formatRemainingTrialTime,
	getRemainingTrialDays,
	getTrialLengthInDays,
	isCustomerProductTrialing,
} from "@autumn/shared";
import { useStore } from "@tanstack/react-form";
import { useCallback } from "react";
import type { UseUpdateSubscriptionForm } from "./useUpdateSubscriptionForm";

interface UseTrialStateParams {
	form: UseUpdateSubscriptionForm;
	customerProduct?: FullCusProduct;
}

export interface TrialState {
	isCurrentlyTrialing: boolean;
	remainingTrialDays: number | null;
	remainingTrialFormatted: string | null;
	trialLength: number | null;
	trialDuration: FreeTrialDuration;
	removeTrial: boolean;
	hasTrialValue: boolean;
	isTrialModified: boolean;
	isTrialExpanded: boolean;
}

export interface TrialActions {
	handleToggleTrial: () => void;
	handleEndTrial: () => void;
	handleRevertTrial: () => void;
	setIsTrialExpanded: (expanded: boolean) => void;
}

export type UseTrialStateReturn = TrialState & TrialActions;

export function useTrialState({
	form,
	customerProduct,
}: UseTrialStateParams): UseTrialStateReturn {
	const isCurrentlyTrialing = customerProduct
		? isCustomerProductTrialing(customerProduct)
		: false;

	const remainingTrialDays =
		isCurrentlyTrialing && customerProduct
			? getRemainingTrialDays({ trialEndsAt: customerProduct.trial_ends_at })
			: null;

	const remainingTrialFormatted =
		isCurrentlyTrialing && customerProduct
			? formatRemainingTrialTime({ trialEndsAt: customerProduct.trial_ends_at })
			: null;

	const trialEnabled = useStore(
		form.store,
		(state) => state.values.trialEnabled,
	);

	const removeTrial = useStore(form.store, (state) => state.values.removeTrial);

	const trialLength = useStore(form.store, (state) => state.values.trialLength);

	const trialDuration = useStore(
		form.store,
		(state) => state.values.trialDuration,
	);

	const hasTrialValue = trialLength !== null && trialLength > 0;

	const newTrialLengthInDays = hasTrialValue
		? getTrialLengthInDays({ trialLength, trialDuration })
		: null;

	const isTrialModified =
		isCurrentlyTrialing &&
		hasTrialValue &&
		remainingTrialDays !== null &&
		newTrialLengthInDays !== remainingTrialDays;

	const handleToggleTrial = useCallback(() => {
		if (removeTrial) {
			form.setFieldValue("removeTrial", false);
			form.setFieldValue("trialEnabled", true);
		} else {
			form.setFieldValue("trialEnabled", !trialEnabled);
		}
	}, [removeTrial, trialEnabled, form]);

	const handleEndTrial = useCallback(() => {
		form.setFieldValue("removeTrial", true);
		form.setFieldValue("trialEnabled", false);
	}, [form]);

	const handleRevertTrial = useCallback(() => {
		form.setFieldValue("removeTrial", false);
		form.setFieldValue("trialEnabled", true);
		form.setFieldValue("trialLength", remainingTrialDays);
		form.setFieldValue("trialDuration", FreeTrialDuration.Day);
	}, [form, remainingTrialDays]);

	const setIsTrialExpanded = useCallback(
		(expanded: boolean) => {
			form.setFieldValue("trialEnabled", expanded);
		},
		[form],
	);

	return {
		isCurrentlyTrialing,
		remainingTrialDays,
		remainingTrialFormatted,
		trialLength,
		trialDuration,
		removeTrial,
		hasTrialValue,
		isTrialModified,
		isTrialExpanded: trialEnabled,
		handleToggleTrial,
		handleEndTrial,
		handleRevertTrial,
		setIsTrialExpanded,
	};
}
