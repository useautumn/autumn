import type { ProductItem } from "@autumn/shared";
import { DISABLED_FREE_TRIAL_FORM_VALUES } from "@/components/forms/shared/utils/freeTrialFormValues";
import { useAppForm } from "@/hooks/form/form";
import { type AttachForm, AttachFormSchema } from "../attachFormSchema";
import { EMPTY_INVOICE_BILLING_DETAILS } from "../utils/invoiceBillingDetails";

export function useAttachForm({
	initialProductId,
	initialPrepaidOptions,
	initialItems,
	initialIsCustom,
	initialVersion,
	defaultOverrides,
}: {
	initialProductId?: string;
	initialPrepaidOptions?: Record<string, number>;
	initialItems?: ProductItem[] | null;
	initialIsCustom?: boolean;
	initialVersion?: number;
	defaultOverrides?: Partial<AttachForm>;
} = {}) {
	return useAppForm({
		defaultValues: {
			productId: initialProductId || "",
			additionalPlans: [],
			removePlanIds: [],
			prepaidOptions: initialPrepaidOptions ?? {},
			licenseQuantities: {},
			items: initialItems ?? null,
			addLicenses: null,
			isCustom: initialIsCustom ?? false,
			version: initialVersion ?? undefined,
			...DISABLED_FREE_TRIAL_FORM_VALUES,
			trialOnEnd: "revert",
			planSchedule: null,
			startDate: null,
			endDate: null,
			prorationBehavior: null,
			redirectMode: "if_required",
			newBillingSubscription: false,
			resetBillingCycle: false,
			billingCycleAnchorMode: "now",
			billingCycleAnchorDate: null,
			discounts: [],
			removedRewardIds: [],
			grantFree: false,
			currency: null,
			noBillingChanges: false,
			chargeTax: true,
			billingDetails: EMPTY_INVOICE_BILLING_DETAILS,
			enablePlanImmediately: false,
			longLivedCheckout: false,
			carryOverBalances: false,
			carryOverBalanceFeatureIds: [],
			carryOverUsages: false,
			carryOverUsageFeatureIds: [],
			customLineItems: [],
			...defaultOverrides,
		} as AttachForm,
		validators: {
			onChange: AttachFormSchema,
			onSubmit: AttachFormSchema,
		},
	});
}

export type UseAttachForm = ReturnType<typeof useAttachForm>;
