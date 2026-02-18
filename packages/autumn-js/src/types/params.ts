import type {
	BalancesCheckRequest,
	BillingAttachRequest,
	CustomerExpand,
} from "@useautumn/sdk";

/** Fields injected by backend - stripped from frontend params */
export type ProtectedFields = "customerId" | "customerData";

/** GetOrCreateCustomer params without protected fields (for frontend use) */
export type ClientGetOrCreateCustomerParams = {
	errorOnNotFound?: boolean;
	expand?: CustomerExpand[];
};

/** Check params for local balance check */
export type ClientCheckParams = Omit<BalancesCheckRequest, ProtectedFields>;

/** Attach params without protected fields (for frontend use) */
export type ClientAttachParams = Omit<
	BillingAttachRequest,
	ProtectedFields | "sendEvent" | "properties" | "withPreview"
> & {
	openInNewTab?: boolean;
};
