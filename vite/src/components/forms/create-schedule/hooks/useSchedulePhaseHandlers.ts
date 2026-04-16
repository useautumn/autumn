import { useCallback } from "react";
import type { EditingPlan } from "../context/CreateScheduleFormProvider";
import {
	EMPTY_SCHEDULE_PLAN,
	isCreateSchedulePhaseLocked,
	type SchedulePlan,
} from "../createScheduleFormSchema";
import type { UseCreateScheduleForm } from "./useCreateScheduleForm";

export function useSchedulePhaseHandlers({
	form,
	nowMs,
	editingPlan,
	setEditingPlan,
}: {
	form: UseCreateScheduleForm;
	nowMs: number;
	editingPlan: EditingPlan | null;
	setEditingPlan: (editing: EditingPlan | null) => void;
}) {
	const isPhaseLocked = useCallback(
		({ phaseIndex }: { phaseIndex: number }) =>
			isCreateSchedulePhaseLocked({
				phases: form.store.state.values.phases,
				phaseIndex,
				nowMs,
			}),
		[form.store, nowMs],
	);

	const handleAddPhase = useCallback(() => {
		form.pushFieldValue("phases", {
			startsAt: null,
			plans: [{ ...EMPTY_SCHEDULE_PLAN }],
		});
	}, [form]);

	const handleInsertPhase = useCallback(
		({ afterIndex }: { afterIndex: number }) => {
			form.insertFieldValue("phases", afterIndex + 1, {
				startsAt: null,
				plans: [{ ...EMPTY_SCHEDULE_PLAN }],
			});
		},
		[form],
	);

	const handleRemovePhase = useCallback(
		({ phaseIndex }: { phaseIndex: number }) => {
			if (isPhaseLocked({ phaseIndex })) return;
			form.removeFieldValue("phases", phaseIndex);
		},
		[form, isPhaseLocked],
	);

	const handleAddPlan = useCallback(
		({ phaseIndex }: { phaseIndex: number }) => {
			if (isPhaseLocked({ phaseIndex })) return;
			form.pushFieldValue(`phases[${phaseIndex}].plans`, {
				...EMPTY_SCHEDULE_PLAN,
			});
		},
		[form, isPhaseLocked],
	);

	const handleRemovePlan = useCallback(
		({ phaseIndex, planIndex }: { phaseIndex: number; planIndex: number }) => {
			if (isPhaseLocked({ phaseIndex })) return;
			const plans = form.store.state.values.phases[phaseIndex]?.plans;
			if (plans && plans.length === 1) {
				form.setFieldValue(`phases[${phaseIndex}].plans[${planIndex}]`, {
					...EMPTY_SCHEDULE_PLAN,
				});
			} else {
				form.removeFieldValue(`phases[${phaseIndex}].plans`, planIndex);
			}
		},
		[form, isPhaseLocked],
	);

	const handlePlanEditSave = useCallback(
		({ plan }: { plan: SchedulePlan }) => {
			if (!editingPlan) return;
			const { phaseIndex, planIndex } = editingPlan;
			if (isPhaseLocked({ phaseIndex })) return;
			form.setFieldValue(`phases[${phaseIndex}].plans[${planIndex}]`, plan);
			setEditingPlan(null);
		},
		[form, editingPlan, isPhaseLocked, setEditingPlan],
	);

	return {
		isPhaseLocked,
		handleAddPhase,
		handleInsertPhase,
		handleRemovePhase,
		handleAddPlan,
		handleRemovePlan,
		handlePlanEditSave,
	};
}
