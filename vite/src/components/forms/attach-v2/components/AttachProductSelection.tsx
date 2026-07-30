import type { FullCustomer } from "@autumn/shared";
import { InlineAction } from "@autumn/ui";
import { PlusIcon } from "@phosphor-icons/react";
import {
	type PlanRowScope,
	ScopedPlanRow,
	SelectedPlanRow,
} from "@/components/forms/shared";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { useAttachFormContext } from "../context/AttachFormProvider";
import { getAttachProductOptionState } from "../hooks/useAttachAdditionalPlans";
import { stripPricesFromItems } from "../utils/grantFreeUtils";
import { AttachAdditionalPlanRow } from "./AttachAdditionalPlanRow";

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
		additionalPlans,
		handleEditPlan,
	} = useAttachFormContext();
	const { customer } = useCusQuery();

	const { productId, additionalPlans: additionalPlanValues } = formValues;
	const {
		isMultiPlan,
		additionalPlanGroupKeys,
		canSelectMultipleScopes,
		canAddPlan,
		handleAddPlan,
	} = additionalPlans;
	const availableProducts = products.filter((product) => !product.archived);
	const fullCustomer = customer as FullCustomer | null;
	const displayedPrimaryItems = formValues.grantFree
		? stripPricesFromItems({
				items: formValues.items ?? product?.items ?? [],
			})
		: formValues.items;

	return (
		<div className="space-y-2">
			{isMultiPlan && productId ? (
				<ScopedPlanRow scope={scope}>
					<SelectedPlanRow
						productId={productId}
						product={product}
						customItems={displayedPrimaryItems}
						isCustom={hasCustomizations || formValues.grantFree}
						onEdit={formValues.grantFree ? undefined : () => handleEditPlan()}
					/>
				</ScopedPlanRow>
			) : (
				<form.AppField name="productId">
					{(field) => (
						<field.SelectField
							label=""
							searchable
							defaultOpen={!productId}
							options={availableProducts.map((product) => {
								const optionState = getAttachProductOptionState({
									product,
									products,
									customer: fullCustomer,
									entityId,
									usedGroupKeys: additionalPlanGroupKeys,
									allowScopeSelection: canSelectMultipleScopes,
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

			{canAddPlan && (
				<InlineAction icon={<PlusIcon size={11} />} onClick={handleAddPlan}>
					Add another product
				</InlineAction>
			)}
		</div>
	);
}
