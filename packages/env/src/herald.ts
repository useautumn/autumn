import {
	balanceWorkerDeploymentToKafkaNames,
	getBalanceWorkerDeployment,
} from "./balanceWorker/balanceWorkerDeployment.js";
import { brokerList } from "./balanceWorker/primitives.js";
import { createKafkaAuthEnv } from "./kafkaAuth.js";

const LOCAL_KAFKA_BROKERS = "127.0.0.1:19092";

const tinybirdOf = ({
	baseUrl,
	token,
}: {
	baseUrl: string | undefined;
	token: string | undefined;
}) => (baseUrl && token ? { baseUrl, token } : null);

/** What herald reads: the balance worker's log, and the Postgres that holds usage events. */
export function createHeraldEnv(
	runtimeEnv: Record<string, string | undefined>,
) {
	if (!runtimeEnv.KAFKA_BROKERS && runtimeEnv.NODE_ENV === "production") {
		throw new Error("KAFKA_BROKERS is required in production");
	}
	if (!runtimeEnv.DATABASE_URL) throw new Error("DATABASE_URL is required");
	// Events have a database of their own where one is configured; otherwise they sit beside everything else.
	const eventsDatabaseUrl =
		runtimeEnv.NEON_EVENTS_DATABASE_URL ?? runtimeEnv.DATABASE_URL;

	const deployment = getBalanceWorkerDeployment({ runtimeEnv });
	return {
		// Absent where Tinybird is not set up: herald then writes usage events to Postgres alone.
		HERALD_TINYBIRD: tinybirdOf({
			baseUrl: runtimeEnv.TINYBIRD_US_EAST_API_URL,
			token: runtimeEnv.TINYBIRD_US_EAST_TOKEN,
		}),
		...createKafkaAuthEnv({ runtimeEnv }),
		KAFKA_BROKERS: brokerList.parse(
			runtimeEnv.KAFKA_BROKERS ?? LOCAL_KAFKA_BROKERS,
		),
		HERALD_METERING_TOPIC: balanceWorkerDeploymentToKafkaNames({ deployment })
			.meteringTopic,
		HERALD_CATALOG_INVALIDATION_TOPIC: balanceWorkerDeploymentToKafkaNames({
			deployment,
		}).catalogInvalidationTopic,
		// One group per deployment: herald's place in the log is this group's committed offsets.
		HERALD_GROUP_ID: `${deployment}-herald`,
		HERALD_EVENTS_DATABASE_URL: eventsDatabaseUrl,
		/** The catalog rows a record's subject references, read on a cache miss. */
		HERALD_DATABASE_URL: runtimeEnv.DATABASE_URL,
		/** Absent where Svix is not set up: herald then decides webhooks and delivers none. */
		HERALD_SVIX_API_KEY: runtimeEnv.SVIX_API_KEY || null,
	};
}

export type HeraldEnv = ReturnType<typeof createHeraldEnv>;
let heraldEnv: HeraldEnv | undefined;

export function getHeraldEnv(): HeraldEnv {
	heraldEnv ??= createHeraldEnv(process.env);
	return heraldEnv;
}
