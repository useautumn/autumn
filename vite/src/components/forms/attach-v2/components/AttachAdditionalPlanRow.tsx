import { IconButton, SearchableSelect } from "@autumn/ui";
import { XIcon } from "@phosphor-icons/react";
import {
	ScopedPlanRow,
	SelectedPlanRow,
	usePlanScopeField,
} from "@/components/forms/shared";
import type { AttachAdditionalPlan } from "../attachFormSchema";
import { useAttachFormContext } from "../context/AttachFormProvider";
import { getAttachDisplayItems } from "../utils/grantFreeUtils";
import { AttachPlanPrepaidQuantityFields } from "./AttachPlanPrepaidQuantityFields";

export function AttachAdditionalPlanRow({
	plan,
}: {
	plan: AttachAdditionalPlan;
}) {
	const {
		form,
		products,
		formValues,
		entityId,
		additionalPlans,
		handleEditPlan,
	} = useAttachFormContext();
	const { getProductOptionState, handleRemovePlan, handleChangePlanProduct } =
		additionalPlans;
	const planIndex = formValues.additionalPlans.findIndex(
		(candidate) => candidate._id === plan._id,
	);
	const { effectiveEntityId, scope, openScope } = usePlanScopeField({
		planEntityId: plan.entityId,
		defaultEntityId: entityId,
		onChange: (nextEntityId) => {
			if (planIndex === -1) return;
			form.setFieldValue(`additionalPlans[${planIndex}]`, {
				...plan,
				entityId: nextEntityId,
			});
		},
	});

	const selectedProduct = products.find(
		(product) => product.id === plan.productId,
	);
	const displayedItems = getAttachDisplayItems({
		items: plan.items,
		productItems: selectedProduct?.items,
		grantFree: formValues.grantFree,
	});

	if (!plan.productId) {
		const productOptions = products.flatMap((product) =>
			product.archived
				? []
				: [
						{
							product,
							...getProductOptionState({
								product,
								planId: plan._id,
								entityId: effectiveEntityId,
							}),
						},
					],
		);

		return (
			<div className="flex items-center gap-2">
				<SearchableSelect
					value={null}
					onValueChange={(productId) => {
						const option = productOptions.find(
							({ product }) => product.id === productId,
						);
						handleChangePlanProduct({ id: plan._id, productId });
						if (option?.requiresDifferentScope) openScope();
					}}
					options={productOptions}
					getOptionValue={({ product }) => product.id}
					getOptionLabel={({ product }) => product.name}
					getOptionDisabled={({ disabledValue }) => !!disabledValue}
					renderOption={({ product, disabledValue, badgeValue }) => {
						return (
							<>
								<span className="flex-1 truncate min-w-0">{product.name}</span>
								{(disabledValue || badgeValue) && (
									<span className="text-xs text-subtle shrink-0">
										{disabledValue ?? badgeValue}
									</span>
								)}
							</>
						);
					}}
					placeholder="Select product..."
					searchable
					searchPlaceholder="Search plans..."
					emptyText="No products found"
					defaultOpen
				/>
				<IconButton
					type="button"
					variant="muted"
					size="sm"
					className="size-6 shrink-0 text-tertiary-foreground hover:text-destructive"
					onClick={() => handleRemovePlan({ id: plan._id })}
					aria-label="Cancel adding product"
					icon={<XIcon size={13} />}
				/>
			</div>
		);
	}

	if (planIndex === -1) return null;

	return (
		<div className="space-y-1.5">
			<ScopedPlanRow scope={scope}>
				<SelectedPlanRow
					productId={plan.productId}
					product={selectedProduct}
					customItems={displayedItems}
					isCustom={plan.isCustom || formValues.grantFree}
					onEdit={
						formValues.grantFree
							? undefined
							: () => handleEditPlan({ additionalPlanId: plan._id })
					}
					onRemove={() => handleRemovePlan({ id: plan._id })}
				/>
			</ScopedPlanRow>
			<AttachPlanPrepaidQuantityFields
				items={displayedItems ?? selectedProduct?.items}
				quantities={plan.prepaidOptions}
				additionalPlanIndex={planIndex}
			/>
		</div>
	);
}
