import type { CreateEntityParams, CustomerData } from "@autumn/shared";

export type CreateEntitiesParams = {
	customerId: string;
	customerData?: CustomerData;
	entities: CreateEntityParams[];
	allowPaidFeatures: boolean;
};
