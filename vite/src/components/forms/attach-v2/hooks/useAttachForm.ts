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
}: {
	initialProductId?: string;
	initialPrepaidOptions?: Record<string, number>;
	initialItems?: ProductItem[] | null;
	initialIsCustom?: boolean;
	initialVersion?: number;
} = {}) {
	return useAppForm({
		defaultValues: {
			productId: initialProductId || "",
			prepaidOptions: initialPrepaidOptions ?? {},
			items: initialItems ?? null,
			isCustom: initialIsCustom ?? false,
			version: initialVersion ?? undefined,
			trialLength: null,
			trialDuration: FreeTrialDuration.Day,
			trialEnabled: false,
			trialCardRequired: true,
			planSchedule: null,
			prorationBehavior: null,
			redirectMode: "if_required",
			newBillingSubscription: false,
			resetBillingCycle: false,
			discounts: [],
			grantFree: false,
			noBillingChanges: false,
			enablePlanImmediately: false,
			carryOverBalances: false,
			carryOverBalanceFeatureIds: [],
			carryOverUsages: false,
			carryOverUsageFeatureIds: [],
			customLineItems: [],
		} as AttachForm,
		validators: {
			onChange: AttachFormSchema,
			onSubmit: AttachFormSchema,
		},
	});
}

export type UseAttachForm = ReturnType<typeof useAttachForm>;
