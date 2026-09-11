import type { ProductItem } from "@autumn/shared";
import { FreeTrialDuration } from "@autumn/shared";
import { useAppForm } from "@/hooks/form/form";
import { type AttachForm, AttachFormSchema } from "../attachFormSchema";

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
			trialLength: null,
			trialDuration: FreeTrialDuration.Day,
			trialEnabled: false,
			trialCardRequired: true,
			trialOnEnd: "revert",
			planSchedule: null,
			startDate: null,
			endDate: null,
			prorationBehavior: null,
			refundLastPayment: null,
			redirectMode: "if_required",
			newBillingSubscription: false,
			resetBillingCycle: false,
			billingCycleAnchorMode: "now",
			billingCycleAnchorDate: null,
			discounts: [],
			grantFree: false,
			currency: null,
			noBillingChanges: false,
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
