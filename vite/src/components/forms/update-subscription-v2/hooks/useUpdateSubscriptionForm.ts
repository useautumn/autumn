import {
	FreeTrialDuration,
	getRemainingTrialDays,
	isCustomerProductTrialing,
} from "@autumn/shared";
import { useMemo } from "react";
import { useAppForm } from "@/hooks/form/form";
import { backendToDisplayQuantity } from "@/utils/billing/prepaidQuantityUtils";
import type { UpdateSubscriptionFormContext } from "../context/UpdateSubscriptionFormProvider";
import {
	type UpdateSubscriptionForm,
	UpdateSubscriptionFormSchema,
} from "../updateSubscriptionFormSchema";

export function useUpdateSubscriptionForm({
	updateSubscriptionFormContext,
	defaultOverrides,
}: {
	updateSubscriptionFormContext: UpdateSubscriptionFormContext;
	defaultOverrides?: Partial<UpdateSubscriptionForm>;
}) {
	const { customerProduct, prepaidItems, currentVersion, product } =
		updateSubscriptionFormContext;

	const initialPrepaidOptions = useMemo(
		() =>
			backendToDisplayQuantity({
				backendOptions: customerProduct.options,
				prepaidItems,
			}),
		[customerProduct.options, prepaidItems],
	);

	const isTrialing = isCustomerProductTrialing(customerProduct);
	const remainingTrialDays = isTrialing
		? getRemainingTrialDays({ trialEndsAt: customerProduct.trial_ends_at })
		: null;
	const trialCardRequired =
		product?.free_trial?.card_required ??
		customerProduct.free_trial?.card_required ??
		true;

	return useAppForm({
		defaultValues: {
			prepaidOptions: initialPrepaidOptions,
			trialLength: remainingTrialDays,
			trialDuration: FreeTrialDuration.Day,
			trialCardRequired,
			removeTrial: false,
			trialEnabled: isTrialing,
			version: currentVersion,
			items: null,
			cancelAction: null,
			billingBehavior: null,
			refundBehavior: null,
			...defaultOverrides,
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
