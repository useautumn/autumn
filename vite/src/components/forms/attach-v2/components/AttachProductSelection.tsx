import { isProductCurrentlyAttached } from "@autumn/shared";
import { IconButton, InlineAction, SearchableSelect } from "@autumn/ui";
import { MinusIcon, PlusIcon, XIcon } from "@phosphor-icons/react";
import { useState } from "react";
import {
	type PlanRowScope,
	ScopedPlanRow,
	SelectedPlanRow,
} from "@/components/forms/shared";
import { getProductGroupKey } from "@/components/forms/shared/utils/planGroupUtils";
import { useAttachFormContext } from "../context/AttachFormProvider";
import { getAttachDisplayItems } from "../utils/grantFreeUtils";
import { AttachAdditionalPlanRow } from "./AttachAdditionalPlanRow";
import { AttachPlanPrepaidQuantityFields } from "./AttachPlanPrepaidQuantityFields";

export function AttachProductSelection({
	scope,
}: {
	scope?: PlanRowScope;
} = {}) {
	const {
		form,
		formValues,
		hasCustomizations,
		entityId,
		product,
		products,
		customer,
		additionalPlans,
		handleEditPlan,
	} = useAttachFormContext();
	const {
		productId,
		additionalPlans: additionalPlanValues,
		removePlanIds,
	} = formValues;
	const { isMultiPlan, canAddPlan, getProductOptionState, handleAddPlan } =
		additionalPlans;
	const availableProducts = products.filter((product) => !product.archived);

	const [isRemovingPlan, setIsRemovingPlan] = useState(false);
	const removableProducts = customer
		? availableProducts.filter((candidate) =>
				isProductCurrentlyAttached({
					productId: candidate.id,
					customer,
					entityId,
				}),
			)
		: [];
	// Removal follows the attach's own entity scope, so it's single-plan only.
	const canRemovePlan =
		!isMultiPlan &&
		!!productId &&
		!isRemovingPlan &&
		removableProducts.length > 0;
	// Add and remove are mutually exclusive: starting one hides the other.
	const isAddingPlan = additionalPlanValues.some((plan) => !plan.productId);
	const showAddAction = canAddPlan && !isRemovingPlan;
	const showRemoveAction = canRemovePlan && !isAddingPlan;

	// A plan in the attach product's group is already expired by the transition.
	const attachGroupKey = productId
		? getProductGroupKey({ productId, products })
		: undefined;
	const removeOptions = removableProducts.map((candidate) => {
		const candidateGroupKey = getProductGroupKey({
			productId: candidate.id,
			products,
		});
		let disabledValue: string | undefined;
		if (candidate.id === productId) {
			disabledValue = "Being added";
		} else if (
			attachGroupKey !== undefined &&
			candidateGroupKey === attachGroupKey
		) {
			disabledValue = "Being replaced";
		} else if (removePlanIds.includes(candidate.id)) {
			disabledValue = "Already removing";
		}
		return { product: candidate, disabledValue };
	});

	const handleSelectRemovePlan = (planId: string) => {
		if (removePlanIds.includes(planId)) return;
		form.setFieldValue("removePlanIds", [...removePlanIds, planId]);
	};
	const handleUndoRemovePlan = (planId: string) => {
		form.setFieldValue(
			"removePlanIds",
			removePlanIds.filter((id) => id !== planId),
		);
	};
	const displayedPrimaryItems = getAttachDisplayItems({
		items: formValues.items,
		productItems: product?.items,
		grantFree: formValues.grantFree,
	});

	return (
		<div className="space-y-2">
			{isMultiPlan && productId ? (
				<div className="space-y-1.5">
					<ScopedPlanRow scope={scope}>
						<SelectedPlanRow
							productId={productId}
							product={product}
							customItems={displayedPrimaryItems}
							isCustom={hasCustomizations || formValues.grantFree}
							onEdit={formValues.grantFree ? undefined : () => handleEditPlan()}
						/>
					</ScopedPlanRow>
					<AttachPlanPrepaidQuantityFields
						items={displayedPrimaryItems ?? product?.items}
						quantities={formValues.prepaidOptions}
					/>
				</div>
			) : (
				<form.AppField name="productId">
					{(field) => (
						<field.SelectField
							label=""
							searchable
							defaultOpen={!productId}
							options={availableProducts.map((product) => {
								const optionState = getProductOptionState({
									product,
									entityId,
								});

								return {
									label: product.name,
									value: product.id,
									...optionState,
								};
							})}
							placeholder="Select Product"
							searchPlaceholder="Search plans..."
							emptyText="No products found"
							hideFieldInfo
							selectValueAfter={
								hasCustomizations && productId ? (
									<span className="rounded-md bg-green-500/10 px-1 py-0 text-xs text-green-500">
										Custom
									</span>
								) : undefined
							}
						/>
					)}
				</form.AppField>
			)}

			{additionalPlanValues.map((plan) => (
				<AttachAdditionalPlanRow key={plan._id} plan={plan} />
			))}

			{removePlanIds.map((planId) => (
				<SelectedPlanRow
					key={planId}
					productId={planId}
					product={products.find((candidate) => candidate.id === planId)}
					price={<span className="text-xs text-destructive">Removing</span>}
					onRemove={() => handleUndoRemovePlan(planId)}
				/>
			))}

			{isRemovingPlan && (
				<div className="flex items-center gap-2">
					<SearchableSelect
						value={null}
						onValueChange={(planId) => {
							handleSelectRemovePlan(planId);
							setIsRemovingPlan(false);
						}}
						options={removeOptions}
						getOptionValue={({ product: candidate }) => candidate.id}
						getOptionLabel={({ product: candidate }) => candidate.name}
						getOptionDisabled={({ disabledValue }) => !!disabledValue}
						renderOption={({ product: candidate, disabledValue }) => (
							<>
								<span className="min-w-0 flex-1 truncate">
									{candidate.name}
								</span>
								{disabledValue && (
									<span className="shrink-0 text-xs text-subtle">
										{disabledValue}
									</span>
								)}
							</>
						)}
						placeholder="Remove a product..."
						searchable
						searchPlaceholder="Search plans..."
						emptyText="No plans to remove"
						defaultOpen
					/>
					<IconButton
						type="button"
						variant="muted"
						size="sm"
						className="size-6 shrink-0 text-tertiary-foreground hover:text-destructive"
						onClick={() => setIsRemovingPlan(false)}
						aria-label="Cancel removing product"
						icon={<XIcon size={13} />}
					/>
				</div>
			)}

			{(showAddAction || showRemoveAction) && (
				<div className="flex items-center gap-4">
					{showAddAction && (
						<InlineAction icon={<PlusIcon size={11} />} onClick={handleAddPlan}>
							Add another product
						</InlineAction>
					)}
					{showRemoveAction && (
						<InlineAction
							icon={<MinusIcon size={11} />}
							onClick={() => setIsRemovingPlan(true)}
						>
							Remove a product
						</InlineAction>
					)}
				</div>
			)}
		</div>
	);
}
