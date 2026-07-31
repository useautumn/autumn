import type { ProductItem } from "@autumn/shared";
import { PlanPrepaidQuantityFields } from "@/components/forms/shared";
import { useAttachFormContext } from "../context/AttachFormProvider";

export function AttachPlanPrepaidQuantityFields({
	items,
	quantities,
	additionalPlanIndex,
}: {
	items?: ProductItem[] | null;
	quantities: Record<string, number | undefined>;
	additionalPlanIndex?: number;
}) {
	const { form, attachCurrency } = useAttachFormContext();
	const getFieldName = ({ featureId }: { featureId: string }) => {
		if (additionalPlanIndex === undefined) {
			return `prepaidOptions.${featureId}` as const;
		}
		return `additionalPlans[${additionalPlanIndex}].prepaidOptions.${featureId}` as const;
	};

	return (
		<PlanPrepaidQuantityFields
			items={items}
			quantities={quantities}
			currency={attachCurrency.displayCurrency}
			renderField={({ featureId, step }) => (
				<form.AppField name={getFieldName({ featureId })}>
					{(field) => (
						<field.QuantityField
							label=""
							min={0}
							step={step}
							compact
							hideFieldInfo
						/>
					)}
				</form.AppField>
			)}
		/>
	);
}
