import type { CreateEntityParams, CustomerData } from "@autumn/shared";

export type CreateEntitiesParams = {
	customerId: string;
	customerData?: CustomerData;
	entities: CreateEntityParams[];
	/** `entity_data` auto-creation refuses a feature that has a price; `entities.create` charges for it. */
	allowPaidFeatures: boolean;
};
