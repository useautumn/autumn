import {
	FreeTrialDuration,
	getRemainingTrialDays,
	isCustomerProductTrialing,
} from "@autumn/shared";
import { useMemo } from "react";
import { useAppForm } from "@/hooks/form/form";
import { backendToDisplayQuantity } from "@/utils/billing/prepaidQuantityUtils";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import type { UpdateSubscriptionFormContext } from "../context/UpdateSubscriptionFormProvider";
import {
	type UpdateSubscriptionForm,
	UpdateSubscriptionFormSchema,
} from "../updateSubscriptionFormSchema";
import { pendingBillingCycleAnchorFormDefaults } from "../utils/pendingBillingCycleAnchor";

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

	const { testClockFrozenTimeMs } = useCusQuery();
	const anchorDefaults = pendingBillingCycleAnchorFormDefaults({
		cusProduct: customerProduct,
		nowMs: testClockFrozenTimeMs ?? Date.now(),
	});

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
			licenseQuantities: {},
			trialLength: remainingTrialDays,
			trialDuration: FreeTrialDuration.Day,
			trialCardRequired,
			removeTrial: false,
			trialEnabled: isTrialing,
			version: currentVersion,
			items: null,
			addLicenses: null,
			cancelAction: null,
			billingBehavior: null,
			...anchorDefaults,
			resetUsage: false,
			refundBehavior: null,
			refundAmount: null,
			noBillingChanges: false,
			discounts: [],
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
