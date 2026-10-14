import type {
	CreateEntityParams,
	Entity,
	FullCusEntWithFullCusProduct,
	FullCustomer,
	FullProduct,
} from "@autumn/shared";
import type { EntitiesByFeature } from "./entitiesByFeature.js";

export type CreateEntitiesContext = {
	fullCustomer: FullCustomer;
	customerEntitlements: FullCusEntWithFullCusProduct[];
	currentEpochMs: number;
	requestedEntities: CreateEntityParams[];
	existingEntities: Entity[];
	insertedEntities: Entity[];
	claimedEntity?: { existing: Entity; claimed: Entity };
	entitiesByFeature: EntitiesByFeature[];
	defaultProducts: FullProduct[];
	invoicedCustomerEntitlements: FullCusEntWithFullCusProduct[];
};
