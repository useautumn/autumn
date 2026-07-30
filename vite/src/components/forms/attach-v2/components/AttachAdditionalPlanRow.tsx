import type { FullCustomer } from "@autumn/shared";
import { IconButton, SearchableSelect } from "@autumn/ui";
import { XIcon } from "@phosphor-icons/react";
import { useState } from "react";
import {
	PlanEntityScopeSelector,
	PlanScopeToggleButton,
	SelectedPlanRow,
} from "@/components/forms/shared";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { useScopeEntitySearch } from "@/views/customers2/customer/hooks/useScopeEntitySearch";
import type { AttachAdditionalPlan } from "../attachFormSchema";
import { useAttachFormContext } from "../context/AttachFormProvider";
import { getAttachProductOptionState } from "../hooks/useAttachAdditionalPlans";
import { stripPricesFromItems } from "../utils/grantFreeUtils";

export function AttachAdditionalPlanRow({
	plan,
	readOnly,
}: {
	plan: AttachAdditionalPlan;
	readOnly?: boolean;
}) {
	const {
		form,
		products,
		formValues,
		entityId,
		additionalPlans,
		handleEditPlan,
	} = useAttachFormContext();
	const {
		usedGroupKeys,
		canSelectMultipleScopes,
		handleRemovePlan,
		handleChangePlanProduct,
	} = additionalPlans;
	const { customer } = useCusQuery();
	const fullCustomer = customer as FullCustomer | null;
	const [scopeOpen, setScopeOpen] = useState(plan.entityId !== undefined);
	const effectiveEntityId =
		plan.entityId === undefined ? entityId : (plan.entityId ?? undefined);
	const {
		hasEntities,
		entities,
		selectedEntity,
		isLoading: isEntitiesLoading,
		setSearch: setEntitySearch,
	} = useScopeEntitySearch({ selectedEntityId: effectiveEntityId });

	const selectedProduct = products.find(
		(product) => product.id === plan.productId,
	);
	const displayedItems = formValues.grantFree
		? stripPricesFromItems({
				items: plan.items ?? selectedProduct?.items ?? [],
			})
		: plan.items;

	if (!plan.productId) {
		const productOptions = products
			.filter((product) => !product.archived)
			.map((product) => ({
				product,
				...getAttachProductOptionState({
					product,
					products,
					customer: fullCustomer,
					entityId: effectiveEntityId,
					usedGroupKeys,
					allowScopeSelection: canSelectMultipleScopes,
				}),
			}));

		return (
			<div className="flex items-center gap-2">
				<SearchableSelect
					value={null}
					onValueChange={(productId) => {
						const option = productOptions.find(
							({ product }) => product.id === productId,
						);
						handleChangePlanProduct({ id: plan._id, productId });
						if (option?.requiresDifferentScope) setScopeOpen(true);
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

	const planIndex = formValues.additionalPlans.findIndex(
		(candidate) => candidate._id === plan._id,
	);

	return (
		<div className="space-y-1.5">
			<div className="flex items-center gap-2">
				<SelectedPlanRow
					productId={plan.productId}
					product={selectedProduct}
					customItems={displayedItems}
					isCustom={plan.isCustom || formValues.grantFree}
					scope={
						readOnly
							? selectedEntity?.name || effectiveEntityId || "Customer-level"
							: undefined
					}
					onEdit={
						readOnly || formValues.grantFree
							? undefined
							: () => handleEditPlan({ additionalPlanId: plan._id })
					}
					onRemove={
						readOnly ? undefined : () => handleRemovePlan({ id: plan._id })
					}
				/>
				{!readOnly && hasEntities && (
					<PlanScopeToggleButton
						open={scopeOpen}
						onClick={() => setScopeOpen((open) => !open)}
					/>
				)}
			</div>
			{!readOnly && scopeOpen && planIndex !== -1 && (
				<div className="ml-4 border-l border-border/40 pl-3">
					<PlanEntityScopeSelector
						entities={entities}
						value={plan.entityId}
						onChange={(nextEntityId) =>
							form.setFieldValue(`additionalPlans[${planIndex}]`, {
								...plan,
								entityId: nextEntityId,
							})
						}
						inheritLabel={entityId ? "Default entity scope" : undefined}
						showLabel={false}
						withSeparator={false}
						wrapInSection={false}
						onSearchChange={setEntitySearch}
						isLoading={isEntitiesLoading}
					/>
				</div>
			)}
		</div>
	);
}
