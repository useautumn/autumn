import { IconButton, SearchableSelect } from "@autumn/ui";
import { XIcon } from "@phosphor-icons/react";
import { useState } from "react";
import {
	PlanEntityScopeSelector,
	resolvePlanEntityId,
	ScopedPlanRow,
	SelectedPlanRow,
} from "@/components/forms/shared";
import { useScopeEntitySearch } from "@/views/customers2/customer/hooks/useScopeEntitySearch";
import type { AttachAdditionalPlan } from "../attachFormSchema";
import { useAttachFormContext } from "../context/AttachFormProvider";
import { getAttachDisplayItems } from "../utils/grantFreeUtils";

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
	const [scopeOpen, setScopeOpen] = useState(plan.entityId !== undefined);
	const effectiveEntityId = resolvePlanEntityId({
		planEntityId: plan.entityId,
		defaultEntityId: entityId,
	});
	const {
		hasEntities,
		entities,
		isLoading: isEntitiesLoading,
		setSearch: setEntitySearch,
	} = useScopeEntitySearch({ selectedEntityId: effectiveEntityId });

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
	const scopeSelector =
		hasEntities && planIndex !== -1 ? (
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
				wrapInSection={false}
				onSearchChange={setEntitySearch}
				isLoading={isEntitiesLoading}
			/>
		) : null;
	const rowScope = scopeSelector
		? {
				open: scopeOpen,
				onToggle: () => setScopeOpen((open) => !open),
				selector: scopeSelector,
			}
		: undefined;

	return (
		<ScopedPlanRow scope={rowScope}>
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
	);
}
