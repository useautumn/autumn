import { CustomerStatePlanPicker } from "@/components/forms/customer-state/components/CustomerStatePlanPicker";
import { getUnscheduledUsedGroupKeys } from "@/components/forms/customer-state/customerStateUtils";
import {
	PlanPrepaidQuantityFields,
	ScopedPlanRow,
	SelectedPlanRow,
	usePlanScopeField,
} from "@/components/forms/shared";
import { useCustomerDisplayCurrency } from "@/hooks/common/useCustomerDisplayCurrency";
import { useCustomerStateContext } from "../CustomerStateProvider";
import { NotFoundBadge } from "./NotFoundBadge";
import { PlanPriceLabel } from "./PlanPriceLabel";

export function UnscheduledPlanRow({ planIndex }: { planIndex: number }) {
	const {
		form,
		formValues,
		products,
		handleRemoveUnscheduledPlan,
		setEditingPlan,
		planNotFoundReasons,
	} = useCustomerStateContext();
	const { displayCurrency } = useCustomerDisplayCurrency();

	const plan = formValues.unscheduledPlans[planIndex];
	const { scope } = usePlanScopeField({
		planEntityId: plan?.entityId,
		onChange: (nextEntityId) =>
			form.setFieldValue(
				`unscheduledPlans[${planIndex}].entityId`,
				nextEntityId ?? null,
			),
	});

	if (!plan) return null;

	const availableProducts = products.filter((p) => !p.archived);
	const selectedProduct = products.find((p) => p.id === plan.productId);
	const usedKeys = getUnscheduledUsedGroupKeys({
		phases: formValues.phases,
		unscheduledPlans: formValues.unscheduledPlans,
		planIndex,
		products,
		entityId: plan.entityId ?? null,
	});

	const handleProductChange = (productId: string) => {
		form.setFieldValue(`unscheduledPlans[${planIndex}].productId`, productId);
		form.setFieldValue(`unscheduledPlans[${planIndex}].prepaidOptions`, {});
		form.setFieldValue(`unscheduledPlans[${planIndex}].items`, null);
		form.setFieldValue(`unscheduledPlans[${planIndex}].version`, undefined);
	};

	if (!plan.productId) {
		// Group conflicts are per scope, so the scope has to be pickable before a
		// plan is chosen — otherwise every group reads as taken at customer level.
		return (
			<ScopedPlanRow scope={scope}>
				<div className="group relative min-w-0 flex-1">
					<CustomerStatePlanPicker
						products={availableProducts}
						usedKeys={usedKeys}
						siblingProductIds={
							new Set(
								formValues.unscheduledPlans
									.filter((_, index) => index !== planIndex)
									.map((p) => p.productId)
									.filter(Boolean),
							)
						}
						onSelect={handleProductChange}
					/>
				</div>
			</ScopedPlanRow>
		);
	}

	return (
		<div className="space-y-1.5">
			<ScopedPlanRow
				scope={scope}
				onCustomize={() =>
					setEditingPlan({ location: "unscheduled", planIndex })
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
								location: "unscheduled",
								planIndex,
							})}
						/>
					}
					onRemove={() => handleRemoveUnscheduledPlan({ planIndex })}
				/>
			</ScopedPlanRow>
			<PlanPrepaidQuantityFields
				items={plan.items ?? selectedProduct?.items}
				quantities={plan.prepaidOptions}
				currency={displayCurrency}
				renderField={({ featureId, step, stops }) => (
					<form.AppField
						name={`unscheduledPlans[${planIndex}].prepaidOptions.${featureId}`}
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
