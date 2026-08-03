import {
	PlanPrepaidQuantityFields,
	ScopedPlanRow,
	SelectedPlanRow,
	usePlanScopeField,
} from "@/components/forms/shared";
import { useCustomerDisplayCurrency } from "@/hooks/common/useCustomerDisplayCurrency";
import { cn } from "@/lib/utils";
import { useCreateScheduleFormContext } from "../context/CreateScheduleFormProvider";
import { getUsedGroupKeys, resolveInheritedPlanScope } from "../scheduleUtils";
import { CopyExistingPlansButton } from "./CopyExistingPlansButton";
import { CopyFromPreviousPhaseButton } from "./CopyFromPreviousPhaseButton";
import { SchedulePlanPicker } from "./SchedulePlanPicker";

export function SchedulePlanRow({
	phaseIndex,
	planIndex,
}: {
	phaseIndex: number;
	planIndex: number;
}) {
	const {
		form,
		formValues,
		products,
		handleRemovePlan,
		isPhaseLocked,
		setEditingPlan,
	} = useCreateScheduleFormContext();
	const { displayCurrency } = useCustomerDisplayCurrency();

	const plan = formValues.phases[phaseIndex]?.plans[planIndex];
	const openingPhasePlans = formValues.phases[0]?.plans ?? [];
	const isOpeningPhase = phaseIndex === 0;
	const isLocked = isPhaseLocked({ phaseIndex });
	// A schedule can't change scope mid-flight: later phases display what they
	// inherit from the opening phase's plan in the same group, read-only.
	const { scope } = usePlanScopeField({
		planEntityId: isOpeningPhase ? plan?.entityId : undefined,
		defaultEntityId: isOpeningPhase
			? undefined
			: resolveInheritedPlanScope({
					productId: plan?.productId ?? "",
					openingPhasePlans,
					products,
				}),
		disabled: !isOpeningPhase || isLocked,
		disabledReason: isLocked
			? "this phase has started"
			: "set on the first phase",
		onChange: (nextEntityId) =>
			form.setFieldValue(
				`phases[${phaseIndex}].plans[${planIndex}].entityId`,
				nextEntityId ?? null,
			),
	});

	if (!plan) return null;

	const availableProducts = products.filter((p) => !p.archived);
	const selectedProduct = products.find((p) => p.id === plan.productId);
	const usedKeys = getUsedGroupKeys({
		plans: formValues.phases[phaseIndex]?.plans ?? [],
		products,
		excludePlanIndex: planIndex,
		entityId: plan.entityId ?? null,
	});

	const selectedProductIdsInPhase = new Set(
		formValues.phases[phaseIndex]?.plans
			.filter((_, i) => i !== planIndex)
			.map((p) => p.productId)
			.filter(Boolean),
	);

	const handleProductChange = (productId: string) => {
		form.setFieldValue(
			`phases[${phaseIndex}].plans[${planIndex}].productId`,
			productId,
		);
		form.setFieldValue(
			`phases[${phaseIndex}].plans[${planIndex}].prepaidOptions`,
			{},
		);
		form.setFieldValue(`phases[${phaseIndex}].plans[${planIndex}].items`, null);
		form.setFieldValue(
			`phases[${phaseIndex}].plans[${planIndex}].version`,
			undefined,
		);
	};

	if (!plan.productId) {
		return (
			<div className={cn("group relative", isLocked && "opacity-60")}>
				<SchedulePlanPicker
					products={availableProducts}
					usedKeys={usedKeys}
					siblingProductIds={selectedProductIdsInPhase}
					header={
						isOpeningPhase ? (
							<CopyExistingPlansButton phaseIndex={phaseIndex} />
						) : (
							<CopyFromPreviousPhaseButton phaseIndex={phaseIndex} />
						)
					}
					disabled={isLocked}
					onSelect={handleProductChange}
				/>
			</div>
		);
	}

	return (
		<div className="space-y-1.5">
			<ScopedPlanRow scope={scope}>
				<SelectedPlanRow
					productId={plan.productId}
					product={selectedProduct}
					customItems={plan.items}
					isCustom={plan.isCustom}
					disabled={isLocked}
					onEdit={() =>
						setEditingPlan({ location: "phase", phaseIndex, planIndex })
					}
					onRemove={() => handleRemovePlan({ phaseIndex, planIndex })}
				/>
			</ScopedPlanRow>
			<PlanPrepaidQuantityFields
				items={plan.items ?? selectedProduct?.items}
				quantities={plan.prepaidOptions}
				currency={displayCurrency}
				readOnly={isLocked}
				renderField={({ featureId, step, stops }) => (
					<form.AppField
						name={`phases[${phaseIndex}].plans[${planIndex}].prepaidOptions.${featureId}`}
					>
						{(field) => (
							<field.QuantityField
								fullWidth
								hideFieldInfo
								label=""
								min={0}
								step={step}
								stops={stops}
							/>
						)}
					</form.AppField>
				)}
			/>
		</div>
	);
}
