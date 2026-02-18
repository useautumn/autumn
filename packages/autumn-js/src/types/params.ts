import type { BillingAttachRequest, CustomerExpand } from "@useautumn/sdk";

/** Fields injected by backend - stripped from frontend params */
export type ProtectedFields = "customerId" | "customerData";

/** Attach params without protected fields (for frontend use) */
export type ClientAttachParams = Omit<BillingAttachRequest, ProtectedFields> & {
	openInNewTab?: boolean;
};

/** GetOrCreateCustomer params without protected fields (for frontend use) */
export type ClientGetOrCreateCustomerParams = {
	errorOnNotFound?: boolean;
	expand?: CustomerExpand[];
};

/** Check params for local balance check */
export type CheckParams = {
	featureId?: string;
	productId?: string;
	entityId?: string;
	requiredBalance?: number;
	requiredQuantity?: number;
};
