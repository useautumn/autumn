import { FIELD_GRID, FIELD_STACK } from "./fieldLayout";
import type { UpdateCustomerForm } from "./useUpdateCustomerForm";

export const CustomerDetailsFields = ({
	form,
}: {
	form: UpdateCustomerForm;
}) => (
	<div className={FIELD_STACK}>
		<div className={FIELD_GRID}>
			<form.AppField name="name">
				{(field) => <field.TextField label="Name" type="text" />}
			</form.AppField>
			<form.AppField name="id">
				{(field) => <field.TextField label="ID" type="text" />}
			</form.AppField>
		</div>
		<form.AppField name="email">
			{(field) => <field.TextField label="Email" type="email" />}
		</form.AppField>
		<form.AppField name="fingerprint">
			{(field) => <field.TextField label="Fingerprint" type="text" />}
		</form.AppField>
		<form.AppField name="stripeId">
			{(field) => (
				<field.TextField
					label="Stripe Customer ID"
					type="text"
					placeholder="cus_..."
				/>
			)}
		</form.AppField>
	</div>
);
