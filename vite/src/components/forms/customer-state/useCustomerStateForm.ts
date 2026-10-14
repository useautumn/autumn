import {
	type CustomerStateForm,
	CustomerStateFormSchema,
	EMPTY_CUSTOMER_STATE_PLAN,
} from "@/components/forms/customer-state/customerStateSchema";
import { EMPTY_DISCOUNTS_FORM_VALUES } from "@/components/forms/shared/utils/discountUtils";
import { DISABLED_FREE_TRIAL_FORM_VALUES } from "@/components/forms/shared/utils/freeTrialFormValues";
import { useAppForm } from "@/hooks/form/form";

export function useCustomerStateForm({
	initialValues,
}: {
	initialValues?: CustomerStateForm;
} = {}) {
	const defaultValues: CustomerStateForm = initialValues ?? {
		phases: [
			{
				startsAt: null,
				plans: [{ ...EMPTY_CUSTOMER_STATE_PLAN }],
			},
		],
		unscheduledPlans: [],
		resetBillingCycle: false,
		billingCycleAnchorMode: "now",
		billingCycleAnchorDate: null,
		endDate: null,
		enablePlanImmediately: false,
		carryOverUsages: false,
		carryOverUsageFeatureIds: [],
		...DISABLED_FREE_TRIAL_FORM_VALUES,
		trialEdited: false,
		...EMPTY_DISCOUNTS_FORM_VALUES,
	};

	return useAppForm({
		defaultValues,
		validators: {
			onChange: CustomerStateFormSchema,
			onSubmit: CustomerStateFormSchema,
		},
	});
}

export type UseCustomerStateForm = ReturnType<typeof useCustomerStateForm>;
