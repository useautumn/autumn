import { useRef } from "react";
import { useAppForm } from "@/hooks/form/form";
import {
	type CreateScheduleForm,
	CreateScheduleFormSchema,
	EMPTY_SCHEDULE_PLAN,
} from "../createScheduleFormSchema";

export function useCreateScheduleForm({
	initialValues,
}: {
	initialValues?: CreateScheduleForm;
} = {}) {
	const defaultValues: CreateScheduleForm = initialValues ?? {
		phases: [{ startsAt: null, plans: [{ ...EMPTY_SCHEDULE_PLAN }] }],
		billingBehavior: null,
		resetBillingCycle: false,
	};

	const initialValuesRef = useRef<CreateScheduleForm>(defaultValues);

	return useAppForm({
		defaultValues: initialValuesRef.current,
		validators: {
			onChange: CreateScheduleFormSchema,
			onSubmit: CreateScheduleFormSchema,
		},
	});
}

export type UseCreateScheduleForm = ReturnType<typeof useCreateScheduleForm>;
