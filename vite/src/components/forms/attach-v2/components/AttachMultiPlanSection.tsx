import {
	resolvePlanEntityId,
	SelectedPlanRow,
} from "@/components/forms/shared";
import { SheetSection } from "@/components/v2/sheets/SharedSheetComponents";
import { useScopeEntitySearch } from "@/views/customers2/customer/hooks/useScopeEntitySearch";
import { useAttachFormContext } from "../context/AttachFormProvider";
import { getAttachDisplayItems } from "../utils/grantFreeUtils";
import { AttachPlanPrepaidQuantityFields } from "./AttachPlanPrepaidQuantityFields";

export function AttachMultiPlanSection() {
	const { formValues, product, products, hasCustomizations, entityId } =
		useAttachFormContext();
	const { entities, selectedEntity } = useScopeEntitySearch({
		selectedEntityId: entityId ?? undefined,
	});
	const selectedPlans = formValues.additionalPlans.flatMap((plan, planIndex) =>
		plan.productId ? [{ plan, planIndex }] : [],
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
				<div className="space-y-1.5">
					<SelectedPlanRow
						productId={formValues.productId}
						product={product}
						customItems={primaryItems}
						isCustom={hasCustomizations || formValues.grantFree}
						scope={selectedEntity?.name || entityId || "Customer-level"}
					/>
					<AttachPlanPrepaidQuantityFields
						items={primaryItems}
						quantities={formValues.prepaidOptions}
					/>
				</div>
				{selectedPlans.map(({ plan, planIndex }) => {
					const selectedProduct = products.find(
						(candidate) => candidate.id === plan.productId,
					);
					const planItems = getAttachDisplayItems({
						items: plan.items,
						productItems: selectedProduct?.items,
						grantFree: formValues.grantFree,
					});
					const planEntityId = resolvePlanEntityId({
						planEntityId: plan.entityId,
						defaultEntityId: entityId,
					});
					const planEntity = entities.find(
						(entity) =>
							entity.id === planEntityId || entity.internal_id === planEntityId,
					);

					return (
						<div key={plan._id} className="space-y-1.5">
							<SelectedPlanRow
								productId={plan.productId}
								product={selectedProduct}
								customItems={planItems}
								isCustom={plan.isCustom || formValues.grantFree}
								scope={planEntity?.name || planEntityId || "Customer-level"}
							/>
							<AttachPlanPrepaidQuantityFields
								items={planItems}
								quantities={plan.prepaidOptions}
								additionalPlanIndex={planIndex}
							/>
						</div>
					);
				})}
			</div>
		</SheetSection>
	);
}
