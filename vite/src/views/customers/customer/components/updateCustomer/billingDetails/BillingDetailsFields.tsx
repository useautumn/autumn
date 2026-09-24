import {
	BILLING_DETAILS_ADDRESS_FIELDS,
	MAX_INVOICE_CUSTOM_FIELDS,
	TAX_EXEMPT_LABELS,
} from "@autumn/shared";
import { FIELD_GRID, FIELD_STACK, LABELED_FIELD } from "../fieldLayout";
import type { UpdateCustomerForm } from "../useUpdateCustomerForm";
import { RowListField } from "./RowListField";

const ADDRESS_LABELS: Record<
	(typeof BILLING_DETAILS_ADDRESS_FIELDS)[number],
	string
> = {
	line1: "Address line 1",
	line2: "Address line 2",
	city: "City",
	state: "State",
	postal_code: "Postal code",
	country: "Country",
};

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
						<field.TextField label={ADDRESS_LABELS[key]} type="text" />
					)}
				</form.AppField>
			))}
		</div>

		<form.Field name="billingDetails.tax_ids">
			{(field) => (
				<RowListField
					label="Tax IDs"
					rows={field.state.value}
					keyField="type"
					keyPlaceholder="eu_vat"
					valuePlaceholder="DE123456789"
					addLabel="Add tax ID"
					onChange={field.handleChange}
				/>
			)}
		</form.Field>

		<form.AppField name="billingDetails.tax_exempt">
			{(field) => (
				<field.SelectField
					label="Tax exempt"
					placeholder="Not exempt"
					options={TAX_EXEMPT_OPTIONS}
					className={LABELED_FIELD}
					hideFieldInfo
				/>
			)}
		</form.AppField>

		<form.Field name="billingDetails.custom_fields">
			{(field) => (
				<RowListField
					label="Invoice custom fields"
					rows={field.state.value}
					keyField="name"
					keyPlaceholder="PO Number"
					valuePlaceholder="PO-10042"
					addLabel="Add custom field"
					maxRows={MAX_INVOICE_CUSTOM_FIELDS}
					onChange={field.handleChange}
				/>
			)}
		</form.Field>
	</div>
);
