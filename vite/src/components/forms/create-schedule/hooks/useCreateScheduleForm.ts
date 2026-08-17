import { useAppForm } from "@/hooks/form/form";
import {
	type CreateScheduleForm,
	CreateScheduleFormSchema,
	EMPTY_SCHEDULE_PLAN,
} from "../createScheduleFormSchema";

/**
 * Values are passed through live, not frozen: each scope owns a separate
 * schedule, and the form re-seeds itself while the user hasn't touched it.
 */
export function useCreateScheduleForm({
	initialValues,
}: {
	initialValues?: CreateScheduleForm;
} = {}) {
	const defaultValues: CreateScheduleForm = initialValues ?? {
		phases: [
			{
				startsAt: null,
				plans: [{ ...EMPTY_SCHEDULE_PLAN }],
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
			onChange: CreateScheduleFormSchema,
			onSubmit: CreateScheduleFormSchema,
		},
	});
}

export type UseCreateScheduleForm = ReturnType<typeof useCreateScheduleForm>;
