import {
	FreeTrialDuration,
	type FullCusProduct,
	getRemainingTrialDays,
	isCustomerProductTrialing,
} from "@autumn/shared";
import { useStore } from "@tanstack/react-form";
import { useCallback, useState } from "react";
import type { UseUpdateSubscriptionForm } from "./useUpdateSubscriptionForm";

interface UseTrialStateParams {
	form: UseUpdateSubscriptionForm;
	customerProduct?: FullCusProduct;
}

export interface TrialState {
	isCurrentlyTrialing: boolean;
	remainingTrialDays: number | null;
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

	const [isTrialExpanded, setIsTrialExpanded] = useState(isCurrentlyTrialing);

	const removeTrial = useStore(form.store, (state) => state.values.removeTrial);

	const trialLength = useStore(form.store, (state) => state.values.trialLength);

	const trialDuration = useStore(
		form.store,
		(state) => state.values.trialDuration,
	);

	const hasTrialValue = trialLength !== null && trialLength > 0;

	const isTrialModified =
		isCurrentlyTrialing &&
		hasTrialValue &&
		remainingTrialDays !== null &&
		trialLength !== remainingTrialDays;

	const handleToggleTrial = useCallback(() => {
		if (removeTrial) {
			form.setFieldValue("removeTrial", false);
			setIsTrialExpanded(true);
		} else {
			setIsTrialExpanded((prev) => !prev);
		}
	}, [removeTrial, form]);

	const handleEndTrial = useCallback(() => {
		form.setFieldValue("removeTrial", true);
	}, [form]);

	const handleRevertTrial = useCallback(() => {
		form.setFieldValue("removeTrial", false);
		form.setFieldValue("trialLength", remainingTrialDays);
		form.setFieldValue("trialDuration", FreeTrialDuration.Day);
	}, [form, remainingTrialDays]);

	return {
		isCurrentlyTrialing,
		remainingTrialDays,
		trialLength,
		trialDuration,
		removeTrial,
		hasTrialValue,
		isTrialModified,
		isTrialExpanded,
		handleToggleTrial,
		handleEndTrial,
		handleRevertTrial,
		setIsTrialExpanded,
	};
}
