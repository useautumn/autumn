import { SelectedPlanRow } from "@/components/forms/shared";
import { SheetSection } from "@/components/v2/sheets/SharedSheetComponents";
import { useScopeEntitySearch } from "@/views/customers2/customer/hooks/useScopeEntitySearch";
import { useAttachFormContext } from "../context/AttachFormProvider";
import { stripPricesFromItems } from "../utils/grantFreeUtils";
import { AttachAdditionalPlanRow } from "./AttachAdditionalPlanRow";

export function AttachMultiPlanSection() {
	const { formValues, product, hasCustomizations, entityId } =
		useAttachFormContext();
	const { selectedEntity } = useScopeEntitySearch({
		selectedEntityId: entityId ?? undefined,
	});
	const selectedPlans = formValues.additionalPlans.filter(
		(plan) => plan.productId,
	);
	const primaryItems = formValues.grantFree
		? stripPricesFromItems({
				items: formValues.items ?? product?.items ?? [],
			})
		: formValues.items;

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
				{selectedPlans.map((plan) => (
					<AttachAdditionalPlanRow key={plan._id} plan={plan} readOnly />
				))}
			</div>
		</SheetSection>
	);
}
