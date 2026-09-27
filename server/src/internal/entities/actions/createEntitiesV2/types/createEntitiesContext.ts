import type {
	CreateEntityParams,
	Entity,
	FullCusEntWithFullCusProduct,
	FullCustomer,
	FullProduct,
} from "@autumn/shared";
import type { EntitiesByFeature } from "./entitiesByFeature.js";

export type CreateEntitiesContext = {
	/** Customer-level rows only; entities are read by the ids the request names. */
	fullCustomer: FullCustomer;
	/** Active, past-due and scheduled grants: scheduled plans were granted before these entities existed. */
	customerEntitlements: FullCusEntWithFullCusProduct[];
	currentEpochMs: number;
	requestedEntities: CreateEntityParams[];
	/** The customer's entities with the requested ids, plus its id-less row. */
	existingEntities: Entity[];
	/** Rows the plan inserts, one per requested entity. */
	insertedEntities: Entity[];
	/** The customer's id-less entity of a requested feature, given that request's id; it already holds a seat. */
	claimedEntity?: { existing: Entity; claimed: Entity };
	/** The request's entities grouped by feature. */
	entitiesByFeature: EntitiesByFeature[];
	/** Free default plans each new entity starts on; paid entity defaults are not attached. */
	defaultProducts: FullProduct[];
	/** Allocated (prorated) grants the inserted entities use: each one is a Stripe quantity change and an invoice. */
	invoicedCustomerEntitlements: FullCusEntWithFullCusProduct[];
};
