import type { ApiBillingDetails, Customer } from "@autumn/shared";
import {
	type BillingDetailsFormValues,
	billingDetailsChanges,
	billingDetailsToFormValues,
} from "./billingDetails/billingDetailsFormValues";

export type UpdateCustomerFormValues = {
	id: string;
	name: string;
	email: string;
	fingerprint: string;
	stripeId: string;
	billingDetails: BillingDetailsFormValues;
};

export const customerToFormValues = ({
	customer,
	billingDetails,
}: {
	customer: Customer;
	billingDetails: ApiBillingDetails | null | undefined;
}): UpdateCustomerFormValues => ({
	id: customer.id ?? "",
	name: customer.name ?? "",
	email: customer.email ?? "",
	fingerprint: customer.fingerprint ?? "",
	stripeId: customer.processor?.id ?? "",
	billingDetails: billingDetailsToFormValues(billingDetails),
});

export const formValuesToCustomerPatch = (
	values: UpdateCustomerFormValues,
) => ({
	name: values.name || null,
	email: values.email || null,
	fingerprint: values.fingerprint || null,
	...(values.id && { id: values.id }),
});

export const formValuesToUpdateCustomerBody = ({
	initial,
	values,
}: {
	initial: UpdateCustomerFormValues;
	values: UpdateCustomerFormValues;
}) => {
	const stripeIdChanged = values.stripeId !== initial.stripeId;
	const billingDetails = stripeIdChanged
		? undefined
		: billingDetailsChanges({
				initial: initial.billingDetails,
				current: values.billingDetails,
			});

	return {
		...formValuesToCustomerPatch(values),
		...(stripeIdChanged && { stripe_id: values.stripeId || null }),
		...(billingDetails && { billing_details: billingDetails }),
	};
};
