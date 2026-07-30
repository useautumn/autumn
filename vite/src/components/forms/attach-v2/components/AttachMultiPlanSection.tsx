import {
	resolvePlanEntityId,
	SelectedPlanRow,
} from "@/components/forms/shared";
import { SheetSection } from "@/components/v2/sheets/SharedSheetComponents";
import { useScopeEntitySearch } from "@/views/customers2/customer/hooks/useScopeEntitySearch";
import { useAttachFormContext } from "../context/AttachFormProvider";
import { getAttachDisplayItems } from "../utils/grantFreeUtils";

export function AttachMultiPlanSection() {
	const { formValues, product, products, hasCustomizations, entityId } =
		useAttachFormContext();
	const { entities, selectedEntity } = useScopeEntitySearch({
		selectedEntityId: entityId ?? undefined,
	});
	const selectedPlans = formValues.additionalPlans.filter(
		(plan) => plan.productId,
	);
	const primaryItems = getAttachDisplayItems({
		items: formValues.items,
		productItems: product?.items,
		grantFree: formValues.grantFree,
	});

	if (selectedPlans.length === 0) return null;

	return (
		<SheetSection title="Plans" withSeparator>
			<div className="space-y-1.5">
				<SelectedPlanRow
					productId={formValues.productId}
					product={product}
					customItems={primaryItems}
					isCustom={hasCustomizations || formValues.grantFree}
					scope={selectedEntity?.name || entityId || "Customer-level"}
				/>
				{selectedPlans.map((plan) => {
					const selectedProduct = products.find(
						(candidate) => candidate.id === plan.productId,
					);
					const planEntityId = resolvePlanEntityId({
						planEntityId: plan.entityId,
						defaultEntityId: entityId,
					});
					const planEntity = entities.find(
						(entity) =>
							entity.id === planEntityId || entity.internal_id === planEntityId,
					);

					return (
						<SelectedPlanRow
							key={plan._id}
							productId={plan.productId}
							product={selectedProduct}
							customItems={getAttachDisplayItems({
								items: plan.items,
								productItems: selectedProduct?.items,
								grantFree: formValues.grantFree,
							})}
							isCustom={plan.isCustom || formValues.grantFree}
							scope={planEntity?.name || planEntityId || "Customer-level"}
						/>
					);
				})}
			</div>
		</SheetSection>
	);
}
