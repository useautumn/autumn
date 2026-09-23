import { serializeCatalogInvalidationRecord } from "../catalogInvalidationTopic.js";
import type {
	CatalogInvalidation,
	CatalogInvalidationPublisher,
	CatalogInvalidationPublisherContext,
} from "./types/catalogInvalidationPublisher.js";

export function createCatalogInvalidationPublisher({
	ctx,
}: {
	ctx: CatalogInvalidationPublisherContext;
}): CatalogInvalidationPublisher {
	async function publish({
		orgId,
		env,
		at,
	}: CatalogInvalidation): Promise<void> {
		await ctx.producer.send({
			topic: ctx.topic,
			messages: [
				serializeCatalogInvalidationRecord({
					record: { schemaVersion: 1, type: "invalidated", orgId, env, at },
				}),
			],
			acks: -1,
		});
	}

	return { publish };
}
