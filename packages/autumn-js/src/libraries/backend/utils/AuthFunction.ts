import type { GetOrCreateCustomerParams } from "@useautumn/sdk";

export type CustomerId = NonNullable<GetOrCreateCustomerParams["customerId"]>;
export type CustomerData = Partial<
	Omit<GetOrCreateCustomerParams, "customerId" | "expand">
>;

export type AuthResult = Promise<{
	customerId?: CustomerId;
	customerData?: CustomerData;
} | null>;
