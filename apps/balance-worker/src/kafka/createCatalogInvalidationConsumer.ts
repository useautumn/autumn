import type { CatalogCache } from "@autumn/catalog-lru";
import {
	type CatalogInvalidationConsumer,
	type CatalogInvalidationKafka,
	type CatalogInvalidationRecord,
	createCatalogInvalidationConsumer as createKafkaCatalogInvalidationConsumer,
} from "@autumn/kafka";
import type { AutumnLogger } from "@autumn/logging";

/** Expires an org's cached catalog rows whenever the server says they changed. */
export function createCatalogInvalidationConsumer({
	ctx,
	config,
}: {
	ctx: {
		kafka: CatalogInvalidationKafka;
		catalogCache: Pick<CatalogCache, "invalidate">;
		logger?: Pick<AutumnLogger, "warn">;
	};
	config: { topic: string; groupIdPrefix: string };
}): CatalogInvalidationConsumer {
	function apply({ record }: { record: CatalogInvalidationRecord }): void {
		ctx.catalogCache.invalidate({ orgId: record.orgId, env: record.env });
	}

	function skip({ cause, offset }: { cause: unknown; offset: string }): void {
		ctx.logger?.warn(
			{ error: cause, offset },
			"Skipped a catalog invalidation that could not be read",
		);
	}

	return createKafkaCatalogInvalidationConsumer({
		ctx: { kafka: ctx.kafka, handler: { apply, skip } },
		config,
	});
}
