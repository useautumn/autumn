import type { CustomerPaymentMethod } from "@/views/customers2/hooks/useCustomerPaymentMethodsQuery";

const capitalize = (value: string) =>
	value.charAt(0).toUpperCase() + value.slice(1);

export const paymentMethodToLabel = (paymentMethod: CustomerPaymentMethod) => {
	const name = capitalize(
		(paymentMethod.brand ?? paymentMethod.type).replaceAll("_", " "),
	);
	const last4 = paymentMethod.last4 ? ` •••• ${paymentMethod.last4}` : "";
	const expiry =
		paymentMethod.exp_month && paymentMethod.exp_year
			? ` · ${String(paymentMethod.exp_month).padStart(2, "0")}/${String(paymentMethod.exp_year).slice(-2)}`
			: "";
	return `${name}${last4}${expiry}${paymentMethod.is_default ? " (default)" : ""}`;
};
