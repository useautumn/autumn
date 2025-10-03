/**
 * Customer-related error codes
 */
export const CustomerErrorCode = {
	InvalidCustomer: "invalid_customer",
	CreateCustomerFailed: "create_customer_failed",
	CustomerNotFound: "customer_not_found",
	CustomersNotFound: "customers_not_found",
	CustomerAlreadyHasProduct: "customer_already_has_product",
	CustomerHasNoPaymentMethod: "customer_has_no_payment_method",
	CustomerHasNoBaseProduct: "customer_has_no_base_product",
	AttachProductToCustomerFailed: "attach_product_to_customer_failed",
	CustomerEntitlementNotFound: "customer_entitlement_not_found",
	MultipleCustomersFound: "multiple_customers_found",
	InvalidUpdateCustomerParams: "invalid_update_customer_params",
	DuplicateCustomerId: "duplicate_customer_id",
	DuplicateCustomerEmail: "duplicate_customer_email",
} as const;

export type CustomerErrorCode =
	(typeof CustomerErrorCode)[keyof typeof CustomerErrorCode];
