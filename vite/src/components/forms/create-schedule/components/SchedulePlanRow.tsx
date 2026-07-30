import { SearchableSelect } from "@autumn/ui";
import { SelectedPlanRow } from "@/components/forms/shared";
import { getProductGroupKey } from "@/components/forms/shared/utils/planGroupUtils";
import { cn } from "@/lib/utils";
import { useCreateScheduleFormContext } from "../context/CreateScheduleFormProvider";
import { CopyFromPreviousPhaseButton } from "./CopyFromPreviousPhaseButton";

export function SchedulePlanRow({
	phaseIndex,
	planIndex,
	usedKeys,
}: {
	phaseIndex: number;
	planIndex: number;
	usedKeys: Set<string>;
}) {
	const {
		form,
		formValues,
		products,
		handleRemovePlan,
		isPhaseLocked,
		setEditingPlan,
	} = useCreateScheduleFormContext();

	const plan = formValues.phases[phaseIndex]?.plans[planIndex];
	if (!plan) return null;
	const isLocked = isPhaseLocked({ phaseIndex });

	const availableProducts = products.filter((p) => !p.archived);
	const selectedProduct = products.find((p) => p.id === plan.productId);

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
				<SearchableSelect
					value={plan.productId || null}
					onValueChange={handleProductChange}
					options={availableProducts}
					getOptionValue={(product) => product.id}
					getOptionLabel={(product) => product.name}
					getOptionDisabled={(product) =>
						usedKeys.has(
							getProductGroupKey({ productId: product.id, products }),
						)
					}
					renderOption={(product) => (
						<>
							<span className="flex-1 truncate min-w-0">{product.name}</span>
							{selectedProductIdsInPhase.has(product.id) && (
								<span className="text-xs text-subtle shrink-0">
									Already selected
								</span>
							)}
							{!selectedProductIdsInPhase.has(product.id) &&
								usedKeys.has(
									getProductGroupKey({ productId: product.id, products }),
								) && (
									<span className="text-xs text-subtle shrink-0">
										Group conflict
									</span>
								)}
						</>
					)}
					header={<CopyFromPreviousPhaseButton phaseIndex={phaseIndex} />}
					placeholder="Select product..."
					searchable
					searchPlaceholder="Search products..."
					emptyText="No products found"
					defaultOpen
					disabled={isLocked}
				/>
			</div>
		);
	}

	return (
		<SelectedPlanRow
			productId={plan.productId}
			product={selectedProduct}
			customItems={plan.items}
			isCustom={plan.isCustom}
			disabled={isLocked}
			onEdit={() => setEditingPlan({ phaseIndex, planIndex })}
			onRemove={() => handleRemovePlan({ phaseIndex, planIndex })}
		/>
	);
}
