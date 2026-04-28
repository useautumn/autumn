import type { AutumnInt } from "@/external/autumn/autumnCli.js";

/**
 * Warms the FullSubject cache for each entity by issuing a read.
 *
 * TEMPORARY: works around a race where entity-level + customer-level tracks
 * issued back-to-back can land before the per-entity FullSubject cache is
 * materialized, causing the customer-level aggregate to undercount entities.
 * Remove once the cache layer guarantees lazy population during tracks.
 */
export const warmEntityCaches = async ({
	autumn,
	customerId,
	entities,
}: {
	autumn: AutumnInt;
	customerId: string;
	entities: { id: string }[];
}): Promise<void> => {
	for (const entity of entities) {
		await autumn.entities.get(customerId, entity.id);
	}
};
