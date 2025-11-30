import type { Customer } from "@autumn/shared";

export const getCustomerDisplay = ({ customer }: { customer: Customer }) => {
	return customer.name || customer.email || customer.id || customer.internal_id;
};
