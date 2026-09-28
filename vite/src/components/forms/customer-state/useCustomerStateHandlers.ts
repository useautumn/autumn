import type { ProductV2 } from "@autumn/shared";
import { useCallback, useMemo, useRef } from "react";
import {
	type CustomerStatePlan,
	EMPTY_CUSTOMER_STATE_PLAN,
	isCreateSchedulePhaseLocked,
	type PlanLocation,
	planLocationToFieldPath,
} from "@/components/forms/customer-state/customerStateSchema";
import {
	findPreviousPhasePlan,
	isSameScope,
	resolveCopySourceScope,
	resolveNextPhaseStartsAt,
} from "@/components/forms/customer-state/customerStateUtils";
import type { UseCustomerStateForm } from "@/components/forms/customer-state/useCustomerStateForm";

const clonePlans = (plans: CustomerStatePlan[]): CustomerStatePlan[] =>
	plans.map((plan) => ({
		...plan,
		prepaidOptions: { ...plan.prepaidOptions },
		licenseQuantities: { ...plan.licenseQuantities },
		items: plan.items ? [...plan.items] : null,
	}));

export function useCustomerStateHandlers({
	form,
	nowMs,
	products,
	editingPlan,
	setEditingPlan,
	existingPlans,
}: {
	form: UseCustomerStateForm;
	nowMs: number;
	products: ProductV2[];
	editingPlan: PlanLocation | null;
	setEditingPlan: (editing: PlanLocation | null) => void;
	existingPlans: CustomerStatePlan[];
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

	const defaultStartsAt = useCallback(
		({ afterIndex }: { afterIndex: number }) =>
			resolveNextPhaseStartsAt({
				phases: form.store.state.values.phases,
				afterIndex,
				products,
				nowMs,
			}),
		[form.store, products, nowMs],
	);

	const lastSelectedEntityId = useRef<string | null>(null);
	// Pickers present at mount wait for the sheet to settle; user-added ones open at once.
	const hasAddedEmptyPlan = useRef(false);
	const newEmptyPlan = useCallback((): CustomerStatePlan => {
		hasAddedEmptyPlan.current = true;
		return {
			...EMPTY_CUSTOMER_STATE_PLAN,
			entityId: lastSelectedEntityId.current,
		};
	}, []);
	const shouldOpenPickerImmediately = useCallback(
		() => hasAddedEmptyPlan.current,
		[],
	);

	const handleAddPhase = useCallback(() => {
		const phases = form.store.state.values.phases;
		form.pushFieldValue("phases", {
			startsAt: defaultStartsAt({ afterIndex: phases.length - 1 }),
			plans: [newEmptyPlan()],
		});
	}, [form, defaultStartsAt, newEmptyPlan]);

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
			form.pushFieldValue(`phases[${phaseIndex}].plans`, newEmptyPlan());
		},
		[form, isPhaseLocked, newEmptyPlan],
	);

	const handleRemovePlan = useCallback(
		({ phaseIndex, planIndex }: { phaseIndex: number; planIndex: number }) => {
			if (isPhaseLocked({ phaseIndex })) return;
			const plans = form.store.state.values.phases[phaseIndex]?.plans;
			if (plans && plans.length === 1) {
				form.setFieldValue(
					`phases[${phaseIndex}].plans[${planIndex}]`,
					newEmptyPlan(),
				);
			} else {
				form.removeFieldValue(`phases[${phaseIndex}].plans`, planIndex);
			}
		},
		[form, isPhaseLocked, newEmptyPlan],
	);

	const handleAddUnscheduledPlan = useCallback(() => {
		form.pushFieldValue("unscheduledPlans", newEmptyPlan());
	}, [form, newEmptyPlan]);

	const handleRemoveUnscheduledPlan = useCallback(
		({ planIndex }: { planIndex: number }) => {
			form.removeFieldValue("unscheduledPlans", planIndex);
		},
		[form],
	);

	// The row becomes a copy of the same plan in the phase before.
	const handleCopyFromPreviousPhase = useCallback(
		({ phaseIndex, planIndex }: { phaseIndex: number; planIndex: number }) => {
			if (phaseIndex < 1 || isPhaseLocked({ phaseIndex })) return;

			const { phases } = form.store.state.values;
			const plan = phases[phaseIndex]?.plans[planIndex];
			const previousPlan =
				plan && findPreviousPhasePlan({ phases, phaseIndex, plan });
			if (!previousPlan) return;

			form.setFieldValue(
				`phases[${phaseIndex}].plans[${planIndex}]`,
				clonePlans([previousPlan])[0],
			);
		},
		[form, isPhaseLocked],
	);

	// One open-ended plan replaces its copy in every phase that hasn't started.
	const handleMakeUnscheduled = useCallback(
		({ phaseIndex, planIndex }: { phaseIndex: number; planIndex: number }) => {
			if (isPhaseLocked({ phaseIndex })) return;
			const { phases, unscheduledPlans } = form.store.state.values;
			const plan = phases[phaseIndex]?.plans[planIndex];
			if (!plan?.productId) return;

			const isSamePlan = (other: CustomerStatePlan) =>
				other.productId === plan.productId &&
				isSameScope({ entityId: other.entityId, otherEntityId: plan.entityId });

			form.setFieldValue(
				"phases",
				phases.map((phase, index) => {
					if (isPhaseLocked({ phaseIndex: index })) return phase;
					const plans = phase.plans.filter((other) => !isSamePlan(other));
					return {
						...phase,
						plans:
							plans.length > 0 ? plans : [{ ...EMPTY_CUSTOMER_STATE_PLAN }],
					};
				}),
			);
			form.setFieldValue("unscheduledPlans", [
				...unscheduledPlans,
				...clonePlans([plan]),
			]);
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
			const plans = form.store.state.values.phases[0]?.plans ?? [];
			const copySource = resolveCopySourceScope({
				existingPlans,
				phasePlans: plans,
				entityId,
			});
			if (!copySource) return;

			form.setFieldValue("phases[0].plans", [
				...clonePlans(plans.slice(0, planIndex)),
				...clonePlans(copySource.plans),
				...clonePlans(plans.slice(planIndex + 1)),
			]);
		},
		[form, existingPlans, isPhaseLocked],
	);

	// Quantities and customizations belong to the old plan, so they reset with it.
	const handleSelectPlanScope = useCallback(
		({
			location,
			entityId,
		}: {
			location: PlanLocation;
			entityId: string | null;
		}) => {
			lastSelectedEntityId.current = entityId;
			form.setFieldValue(
				`${planLocationToFieldPath(location)}.entityId`,
				entityId,
			);
		},
		[form],
	);

	const handleSelectPlanProduct = useCallback(
		({
			location,
			productId,
		}: {
			location: PlanLocation;
			productId: string;
		}) => {
			const path = planLocationToFieldPath(location);
			form.setFieldValue(`${path}.productId`, productId);
			form.setFieldValue(`${path}.prepaidOptions`, {});
			form.setFieldValue(`${path}.licenseQuantities`, {});
			form.setFieldValue(`${path}.items`, null);
			form.setFieldValue(`${path}.version`, undefined);
		},
		[form],
	);

	const handlePlanEditSave = useCallback(
		({ plan }: { plan: CustomerStatePlan }) => {
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

	return useMemo(
		() => ({
			isPhaseLocked,
			shouldOpenPickerImmediately,
			handleAddPhase,
			handleRemovePhase,
			handleAddPlan,
			handleRemovePlan,
			handleAddUnscheduledPlan,
			handleRemoveUnscheduledPlan,
			handleCopyFromPreviousPhase,
			handleMakeUnscheduled,
			handleCopyExistingPlans,
			handleSelectPlanScope,
			handleSelectPlanProduct,
			handlePlanEditSave,
		}),
		[
			isPhaseLocked,
			shouldOpenPickerImmediately,
			handleAddPhase,
			handleRemovePhase,
			handleAddPlan,
			handleRemovePlan,
			handleAddUnscheduledPlan,
			handleRemoveUnscheduledPlan,
			handleCopyFromPreviousPhase,
			handleMakeUnscheduled,
			handleCopyExistingPlans,
			handleSelectPlanScope,
			handleSelectPlanProduct,
			handlePlanEditSave,
		],
	);
}
