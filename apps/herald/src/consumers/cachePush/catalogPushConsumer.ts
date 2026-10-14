import {
	type CatalogInvalidationConsumer,
	type CatalogInvalidationKafka,
	type CatalogInvalidationRecord,
	createCatalogInvalidationConsumer as createKafkaCatalogInvalidationConsumer,
} from "@autumn/kafka";
import { AppEnv } from "@autumn/shared";
import { z } from "zod/v4";
import { pushCatalogToCache } from "./pushCatalogToCache/pushCatalogToCache.js";
import type { CatalogPushContext } from "./types/catalogPushContext.js";

const appEnvSchema = z.enum(AppEnv);

export function createCatalogPushConsumer({
	ctx,
	config,
}: {
	ctx: CatalogPushContext & { kafka: CatalogInvalidationKafka };
	config: { topic: string; groupId: string };
}): CatalogInvalidationConsumer {
	async function apply({
		record,
	}: {
		record: CatalogInvalidationRecord;
	}): Promise<void> {
		await pushCatalogToCache({
			ctx,
			orgId: record.orgId,
			env: appEnvSchema.parse(record.env),
		});
	}

	function skip({ cause, offset }: { cause: unknown; offset: string }): void {
		ctx.logger.warn(
			{
				error: cause,
				type: "herald_catalog_push_skipped",
				data: { offset },
			},
			"Herald passed over a catalog change it could not push to the org's Atom",
		);
	}

	return createKafkaCatalogInvalidationConsumer({
		ctx: { kafka: ctx.kafka, handler: { apply, skip } },
		config: {
			topic: config.topic,
			group: { kind: "shared", id: config.groupId },
		},
	});
}
