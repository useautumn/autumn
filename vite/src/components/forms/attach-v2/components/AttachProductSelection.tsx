import {
	isProductAlreadyEnabled,
	isProductCurrentlyAttached,
} from "@autumn/shared";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useEntity } from "@/hooks/stores/useSubscriptionStore";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { useAttachFormContext } from "../context/AttachFormProvider";

export function AttachProductSelection() {
	const { form, hasCustomizations } = useAttachFormContext();

	const { products } = useProductsQuery();
	const availableProducts = products.filter((p) => !p.archived);
	const { customer } = useCusQuery();
	const { entityId } = useEntity();

	const productId = form.state.values.productId;

	return (
		<div className="space-y-4">
			<form.AppField name="productId">
				{(field) => (
					<field.SelectField
						label=""
						searchable
						defaultOpen
						options={availableProducts.map((p) => {
							const entityIdVal = entityId ?? undefined;
							const alreadyEnabled = isProductAlreadyEnabled({
								productId: p.id,
								customer,
								entityId: entityIdVal,
							});
							const currentlyAttached =
								!alreadyEnabled &&
								isProductCurrentlyAttached({
									productId: p.id,
									customer,
									entityId: entityIdVal,
								});

							return {
								label: p.name,
								value: p.id,
								disabledValue: alreadyEnabled ? "Already Enabled" : undefined,
								badgeValue: currentlyAttached ? "Already Enabled" : undefined,
							};
						})}
						placeholder="Select Product"
						searchPlaceholder="Search plans..."
						emptyText="No products found"
						hideFieldInfo
						selectValueAfter={
							hasCustomizations && productId ? (
								<span className="text-xs bg-green-500/10 text-green-500 px-1 py-0 rounded-md">
									Custom
								</span>
							) : undefined
						}
					/>
				)}
			</form.AppField>
		</div>
	);
}
