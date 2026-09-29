import type { Entity } from "@autumn/shared";

export const entityKey = (entity: Entity): string =>
	entity.id || entity.internal_id;
