import type { Entity, Feature } from "@autumn/shared";

export type EntitiesByFeature = {
	feature: Feature;
	inserted: Entity[];
	claimed: Entity[];
};
