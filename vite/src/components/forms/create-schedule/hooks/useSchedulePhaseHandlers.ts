import { useCallback } from "react";
import type { EditingPlan } from "../context/CreateScheduleFormProvider";
import {
	EMPTY_SCHEDULE_PLAN,
	isCreateSchedulePhaseLocked,
	type SchedulePlan,
} from "../createScheduleFormSchema";
import { filterPlansByScope } from "../scheduleUtils";
import type { UseCreateScheduleForm } from "./useCreateScheduleForm";

const clonePlans = (plans: SchedulePlan[]): SchedulePlan[] =>
	plans.map((plan) => ({
		...plan,
		prepaidOptions: { ...plan.prepaidOptions },
		items: plan.items ? [...plan.items] : null,
	}));

export function useSchedulePhaseHandlers({
	form,
	nowMs,
	editingPlan,
	setEditingPlan,
	existingPlans,
}: {
	form: UseCreateScheduleForm;
	nowMs: number;
	editingPlan: EditingPlan | null;
	setEditingPlan: (editing: EditingPlan | null) => void;
	existingPlans: SchedulePlan[];
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

	const handleAddUnscheduledPlan = useCallback(() => {
		form.pushFieldValue("unscheduledPlans", { ...EMPTY_SCHEDULE_PLAN });
	}, [form]);

	const handleRemoveUnscheduledPlan = useCallback(
		({ planIndex }: { planIndex: number }) => {
			form.removeFieldValue("unscheduledPlans", planIndex);
		},
		[form],
	);

	const handleCopyFromPreviousPhase = useCallback(
		({ phaseIndex }: { phaseIndex: number }) => {
			if (phaseIndex < 1 || isPhaseLocked({ phaseIndex })) return;

			const previousPlans =
				form.store.state.values.phases[phaseIndex - 1]?.plans;
			if (!previousPlans?.length) return;

			form.setFieldValue(
				`phases[${phaseIndex}].plans`,
				clonePlans(previousPlans),
			);
		},
		[form, isPhaseLocked],
	);

	// Copies into the row that asked, so only that row's scope is pulled in.
	const handleCopyExistingPlans = useCallback(
		({
			planIndex,
			entityId,
		}: {
			planIndex: number;
			entityId: string | null;
		}) => {
			if (isPhaseLocked({ phaseIndex: 0 })) return;
			const scopedPlans = filterPlansByScope({
				plans: existingPlans,
				entityId,
			});
			if (!scopedPlans.length) return;

			const plans = form.store.state.values.phases[0]?.plans ?? [];
			form.setFieldValue("phases[0].plans", [
				...clonePlans(plans.slice(0, planIndex)),
				...clonePlans(scopedPlans),
				...clonePlans(plans.slice(planIndex + 1)),
			]);
		},
		[form, existingPlans, isPhaseLocked],
	);

	const handlePlanEditSave = useCallback(
		({ plan }: { plan: SchedulePlan }) => {
			if (!editingPlan) return;
			const { planIndex } = editingPlan;

			if (editingPlan.location === "unscheduled") {
				form.setFieldValue(`unscheduledPlans[${planIndex}]`, plan);
				setEditingPlan(null);
				return;
			}

			const { phaseIndex } = editingPlan;
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
		handleAddUnscheduledPlan,
		handleRemoveUnscheduledPlan,
		handleCopyFromPreviousPhase,
		handleCopyExistingPlans,
		handlePlanEditSave,
	};
}
