import {
	BILLING_DETAILS_ADDRESS_FIELDS,
	BILLING_DETAILS_ADDRESS_LABELS,
	BILLING_DETAILS_LABELS,
	MAX_INVOICE_CUSTOM_FIELDS,
	TAX_EXEMPT_LABELS,
} from "@autumn/shared";
import { FIELD_GRID, FIELD_STACK, LABELED_FIELD } from "../fieldLayout";
import type { UpdateCustomerForm } from "../useUpdateCustomerForm";
import { RowListField } from "./RowListField";

const TAX_EXEMPT_OPTIONS = Object.entries(TAX_EXEMPT_LABELS).map(
	([value, label]) => ({ value, label }),
);

export const BillingDetailsFields = ({
	form,
}: {
	form: UpdateCustomerForm;
}) => (
	<div className={FIELD_STACK}>
		<div className={FIELD_GRID}>
			{BILLING_DETAILS_ADDRESS_FIELDS.map((key) => (
				<form.AppField key={key} name={`billingDetails.address.${key}`}>
					{(field) => (
						<field.TextField
							label={BILLING_DETAILS_ADDRESS_LABELS[key]}
							type="text"
						/>
					)}
				</form.AppField>
			))}
		</div>

		<form.Field name="billingDetails.tax_ids">
			{(field) => (
				<RowListField
					label={BILLING_DETAILS_LABELS.taxIds}
					rows={field.state.value}
					keyField="type"
					keyPlaceholder="eu_vat"
					valuePlaceholder="DE123456789"
					addLabel={BILLING_DETAILS_LABELS.addTaxId}
					onChange={field.handleChange}
				/>
			)}
		</form.Field>

		<form.AppField name="billingDetails.tax_exempt">
			{(field) => (
				<field.SelectField
					label={BILLING_DETAILS_LABELS.taxExempt}
					placeholder={TAX_EXEMPT_LABELS.none}
					options={TAX_EXEMPT_OPTIONS}
					className={LABELED_FIELD}
					hideFieldInfo
				/>
			)}
		</form.AppField>

		<form.Field name="billingDetails.custom_fields">
			{(field) => (
				<RowListField
					label={BILLING_DETAILS_LABELS.customFields}
					rows={field.state.value}
					keyField="name"
					keyPlaceholder="PO Number"
					valuePlaceholder="PO-10042"
					addLabel={BILLING_DETAILS_LABELS.addCustomField}
					maxRows={MAX_INVOICE_CUSTOM_FIELDS}
					onChange={field.handleChange}
				/>
			)}
		</form.Field>
	</div>
);
