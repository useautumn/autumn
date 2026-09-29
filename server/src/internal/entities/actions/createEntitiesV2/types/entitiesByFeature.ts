import type { Entity, Feature } from "@autumn/shared";

/** The request's entities for one feature: rows it inserts, and the id-less row it claims (already holding a seat). */
export type EntitiesByFeature = {
	feature: Feature;
	inserted: Entity[];
	claimed: Entity[];
};
