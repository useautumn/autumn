import {
	type CustomerStateForm,
	CustomerStateFormSchema,
	EMPTY_CUSTOMER_STATE_PLAN,
} from "@/components/forms/customer-state/customerStateSchema";
import { useAppForm } from "@/hooks/form/form";

/**
 * Values are passed through live, not frozen: each scope owns a separate
 * schedule, and the form re-seeds itself while the user hasn't touched it.
 */
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
		billingBehavior: null,
		resetBillingCycle: false,
		enablePlanImmediately: false,
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
