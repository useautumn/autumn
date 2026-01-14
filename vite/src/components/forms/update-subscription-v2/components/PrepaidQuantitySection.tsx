import { SheetSection } from "@/components/v2/sheets/SharedSheetComponents";
import type { PrepaidItemWithFeature } from "@/hooks/stores/useProductStore";
import type { UseUpdateSubscriptionForm } from "../hooks/useUpdateSubscriptionForm";

interface PrepaidQuantitySectionProps {
	form: UseUpdateSubscriptionForm;
	prepaidItems: PrepaidItemWithFeature[];
}

export function PrepaidQuantitySection({
	form,
	prepaidItems,
}: PrepaidQuantitySectionProps) {
	if (prepaidItems.length === 0) return null;

	return (
		<SheetSection title="Prepaid Quantities" withSeparator>
			<div className="flex flex-col gap-3">
				{prepaidItems.map((item) => {
					const featureId = item.feature_id ?? item.feature?.internal_id ?? "";
					const displayName = item.feature?.name || featureId;
					const billingUnits = item.billing_units ?? 1;

					return (
						<div
							key={featureId}
							className="grid grid-cols-[1fr_auto] gap-2 items-center"
						>
							<span className="text-sm text-t3">
								{displayName}
								{billingUnits > 1 && (
									<span className="text-t4 ml-1 text-xs">
										(x{billingUnits})
									</span>
								)}
							</span>
							<form.AppField name={`prepaidOptions.${featureId}`}>
								{(field) => (
									<field.QuantityField label="" min={0} hideFieldInfo />
								)}
							</form.AppField>
						</div>
					);
				})}
			</div>
		</SheetSection>
	);
}
