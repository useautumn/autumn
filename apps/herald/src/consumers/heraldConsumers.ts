import type { MiscCache } from "@autumn/cache";
import type { CatalogCache } from "@autumn/catalog-lru";
import type { AutumnLogger } from "@autumn/logging";
import type { EventsDb } from "@autumn/postgres";
import type { SqsJobs } from "@autumn/sqs";
import type { SvixClient } from "@autumn/svix";
import type { EventsTinybird } from "@autumn/tinybird";
import type { StreamConsumer } from "../stream/types/streamConsumer.js";
import { createAutoTopupsConsumer } from "./autoTopups/autoTopupsConsumer.js";
import { createBalanceWebhooksConsumer } from "./balanceWebhooks/balanceWebhooksConsumer.js";
import { createCachePushConsumer } from "./cachePush/cachePushConsumer.js";
import { createUsageEventsConsumer } from "./usageEvents/usageEventsConsumer.js";

/** Every job herald runs. A new job is a folder beside these and one line here. */
export function createHeraldConsumers({
	ctx,
}: {
	ctx: {
		eventsDb: EventsDb;
		eventsTinybird: EventsTinybird | null;
		svix: SvixClient | null;
		catalogCache: Pick<CatalogCache, "read" | "load">;
		miscCache: Pick<MiscCache, "getActive">;
		sqsJobs: Pick<SqsJobs, "autoTopup">;
		logger: AutumnLogger;
	};
}): StreamConsumer[] {
	return [
		createUsageEventsConsumer({ ctx }),
		createBalanceWebhooksConsumer({ ctx }),
		createAutoTopupsConsumer({ ctx }),
		createCachePushConsumer({ ctx }),
	];
}
