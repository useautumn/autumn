import type { GetOrCreateCustomerParams } from "@useautumn/sdk";

/** Customer ID type derived from SDK */
export type CustomerId = NonNullable<GetOrCreateCustomerParams["customerId"]>;

/** Customer data that can be passed to SDK methods */
export type CustomerData = Partial<
	Omit<GetOrCreateCustomerParams, "customerId" | "expand">
>;

/** Resolved identity from the identify function */
export type ResolvedIdentity = {
	customerId: CustomerId | null | undefined;
	customerData?: CustomerData;
};

/** Result of the identify function (can be sync or async) */
export type AuthResult =
	| ResolvedIdentity
	| null
	| Promise<ResolvedIdentity | null>;
