import type { ProductItem } from "@autumn/shared";
import { PlanPrepaidQuantityFields } from "@/components/forms/shared";
import { useCreateInvoiceFormContext } from "../context/CreateInvoiceFormProvider";
import { INVOICE_USAGE_MODELS } from "../utils/applyInvoicePlanEditorItems";

export function CreateInvoiceQuantityFields({
	items,
	quantities,
	planIndex,
	licenseIndex,
	currency,
}: {
	items?: ProductItem[] | null;
	quantities: Record<string, number | undefined>;
	planIndex: number;
	licenseIndex?: number;
	currency?: string;
}) {
	const { form } = useCreateInvoiceFormContext();

	const getFieldName = ({ featureId }: { featureId: string }) =>
		licenseIndex === undefined
			? (`plans[${planIndex}].featureQuantities.${featureId}` as const)
			: (`plans[${planIndex}].licenses[${licenseIndex}].featureQuantities.${featureId}` as const);

	return (
		<PlanPrepaidQuantityFields
			items={items}
			quantities={quantities}
			currency={currency}
			usageModels={INVOICE_USAGE_MODELS}
			renderField={({ featureId, step, stops }) => (
				<form.AppField name={getFieldName({ featureId })}>
					{(field) => (
						<field.QuantityField
							fullWidth
							hideFieldInfo
							label=""
							min={0}
							step={step}
							stops={stops}
						/>
					)}
				</form.AppField>
			)}
		/>
	);
}
