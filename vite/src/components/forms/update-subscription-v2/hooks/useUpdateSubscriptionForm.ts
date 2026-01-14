import { FreeTrialDuration } from "@autumn/shared";
import { useMemo } from "react";
import { useAppForm } from "@/hooks/form/form";
import type { UpdateSubscriptionFormContext } from "../context/UpdateSubscriptionFormContext";
import {
	type UpdateSubscriptionForm,
	UpdateSubscriptionFormSchema,
} from "../updateSubscriptionFormSchema";

export function useUpdateSubscriptionForm({
	updateSubscriptionFormContext,
}: {
	updateSubscriptionFormContext: UpdateSubscriptionFormContext;
}) {
	const { customerProduct, prepaidItems } = updateSubscriptionFormContext;

	const initialPrepaidOptions = useMemo(() => {
		const subscriptionValues = customerProduct.options.reduce(
			(accumulator, option) => {
				accumulator[option.feature_id] = option.quantity;
				return accumulator;
			},
			{} as Record<string, number>,
		);

		return prepaidItems.reduce(
			(accumulator, item) => {
				const featureId = item.feature_id as string;
				accumulator[featureId] = subscriptionValues[featureId] ?? 0;
				return accumulator;
			},
			{} as Record<string, number>,
		);
	}, [customerProduct.options, prepaidItems]);

	return useAppForm({
		defaultValues: {
			prepaidOptions: initialPrepaidOptions,
			trialLength: null,
			trialDuration: FreeTrialDuration.Day,
			trialCardRequired: true,
			removeTrial: false,
		} as UpdateSubscriptionForm,
		validators: {
			onChange: UpdateSubscriptionFormSchema,
			onSubmit: UpdateSubscriptionFormSchema,
		},
	});
}

export type UseUpdateSubscriptionForm = ReturnType<
	typeof useUpdateSubscriptionForm
>;
