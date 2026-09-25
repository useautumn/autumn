import { CalendarSlashIcon, CopySimpleIcon } from "@phosphor-icons/react";
import { CopyExistingPlansButton } from "@/components/forms/customer-state/components/CopyExistingPlansButton";
import { CustomerStatePlanPicker } from "@/components/forms/customer-state/components/CustomerStatePlanPicker";
import { getUsedGroupKeys } from "@/components/forms/customer-state/customerStateUtils";
import { findPreviousPhasePlan } from "@/components/forms/customer-state/useCustomerStateHandlers";
import {
	PlanPrepaidQuantityFields,
	ScopedPlanRow,
	SelectedPlanRow,
	usePlanScopeField,
} from "@/components/forms/shared";
import type { PlanRowAction } from "@/components/forms/shared/PlanRowActionsMenu";
import { useCustomerDisplayCurrency } from "@/hooks/common/useCustomerDisplayCurrency";
import { cn } from "@/lib/utils";
import { useCustomerStateContext } from "../CustomerStateProvider";
import { NotFoundBadge } from "./NotFoundBadge";
import { PlanPriceLabel } from "./PlanPriceLabel";

export function CustomerStatePlanRow({
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
		handleCopyFromPreviousPhase,
		handleMakeUnscheduled,
		isPhaseLocked,
		setEditingPlan,
		canMakeUnscheduled,
		planNotFoundReasons,
	} = useCustomerStateContext();
	const { displayCurrency } = useCustomerDisplayCurrency();

	const plan = formValues.phases[phaseIndex]?.plans[planIndex];
	const isOpeningPhase = phaseIndex === 0;
	const isLocked = isPhaseLocked({ phaseIndex });
	const { scope, hasEntities, selectedLabel } = usePlanScopeField({
		planEntityId: plan?.entityId,
		disabled: isLocked,
		disabledReason: "this phase has started",
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
		// Group conflicts are per scope, so the scope has to be pickable before a
		// plan is chosen — otherwise every group reads as taken at customer level.
		return (
			<ScopedPlanRow scope={scope}>
				<div
					className={cn(
						"group relative min-w-0 flex-1",
						isLocked && "opacity-60",
					)}
				>
					<CustomerStatePlanPicker
						products={availableProducts}
						usedKeys={usedKeys}
						siblingProductIds={selectedProductIdsInPhase}
						header={
							isOpeningPhase ? (
								<CopyExistingPlansButton
									phaseIndex={phaseIndex}
									planIndex={planIndex}
									entityId={plan.entityId ?? null}
									scopeLabel={hasEntities ? selectedLabel : undefined}
								/>
							) : undefined
						}
						disabled={isLocked}
						onSelect={handleProductChange}
					/>
				</div>
			</ScopedPlanRow>
		);
	}

	const canCopyFromPreviousPhase =
		!isLocked &&
		Boolean(
			findPreviousPhasePlan({ phases: formValues.phases, phaseIndex, plan }),
		);
	const rowActions: PlanRowAction[] = [
		...(canCopyFromPreviousPhase
			? [
					{
						label: "Copy from previous phase",
						icon: <CopySimpleIcon size={14} />,
						onSelect: () =>
							handleCopyFromPreviousPhase({ phaseIndex, planIndex }),
					},
				]
			: []),
		...(!isLocked && canMakeUnscheduled
			? [
					{
						label: "Make unscheduled",
						icon: <CalendarSlashIcon size={14} />,
						onSelect: () => handleMakeUnscheduled({ phaseIndex, planIndex }),
					},
				]
			: []),
	];

	return (
		<div className="space-y-1.5">
			<ScopedPlanRow
				scope={scope}
				actions={rowActions}
				onCustomize={
					isLocked
						? undefined
						: () => setEditingPlan({ location: "phase", phaseIndex, planIndex })
				}
			>
				<SelectedPlanRow
					productId={plan.productId}
					product={selectedProduct}
					customItems={plan.items}
					isCustom={plan.isCustom}
					price={
						selectedProduct && (
							<PlanPriceLabel product={selectedProduct} items={plan.items} />
						)
					}
					badge={
						<NotFoundBadge
							reasons={planNotFoundReasons({
								location: "phase",
								phaseIndex,
								planIndex,
							})}
						/>
					}
					disabled={isLocked}
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
