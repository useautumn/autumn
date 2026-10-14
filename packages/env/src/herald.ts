import {
	balanceWorkerDeploymentToKafkaNames,
	getBalanceWorkerDeployment,
} from "./balanceWorker/balanceWorkerDeployment.js";
import { brokerList } from "./balanceWorker/primitives.js";
import { createKafkaAuthEnv } from "./kafkaAuth.js";
import { isStagingEnv } from "./staging.js";

const LOCAL_KAFKA_BROKERS = "127.0.0.1:19092";

const alienOf = ({
	apiKey,
	project,
}: {
	apiKey: string | undefined;
	project: string | undefined;
}) => (apiKey && project ? { apiKey, project } : null);

const tinybirdOf = ({
	baseUrl,
	token,
}: {
	baseUrl: string | undefined;
	token: string | undefined;
}) => (baseUrl && token ? { baseUrl, token } : null);

export function createHeraldEnv(
	runtimeEnv: Record<string, string | undefined>,
) {
	if (!runtimeEnv.KAFKA_BROKERS && runtimeEnv.NODE_ENV === "production") {
		throw new Error("KAFKA_BROKERS is required in production");
	}
	if (!runtimeEnv.DATABASE_URL) throw new Error("DATABASE_URL is required");
	const eventsDatabaseUrl =
		runtimeEnv.NEON_EVENTS_DATABASE_URL ?? runtimeEnv.DATABASE_URL;

	const deployment = getBalanceWorkerDeployment({ runtimeEnv });
	return {
		HERALD_TINYBIRD: tinybirdOf({
			baseUrl: runtimeEnv.TINYBIRD_US_EAST_API_URL,
			token: runtimeEnv.TINYBIRD_US_EAST_TOKEN,
		}),
		...createKafkaAuthEnv({ runtimeEnv, serviceUser: "HERALD" }),
		KAFKA_BROKERS: brokerList.parse(
			runtimeEnv.KAFKA_BROKERS ?? LOCAL_KAFKA_BROKERS,
		),
		HERALD_METERING_TOPIC: balanceWorkerDeploymentToKafkaNames({ deployment })
			.meteringTopic,
		HERALD_CATALOG_INVALIDATION_TOPIC: balanceWorkerDeploymentToKafkaNames({
			deployment,
		}).catalogInvalidationTopic,
		HERALD_GROUP_ID: `${deployment}-herald`,
		HERALD_EVENTS_DATABASE_URL: eventsDatabaseUrl,
		HERALD_DATABASE_URL: runtimeEnv.DATABASE_URL,
		HERALD_SVIX_API_KEY: runtimeEnv.SVIX_API_KEY || null,
		HERALD_DEPLOYMENT: deployment,
		HERALD_ALIEN: alienOf({
			apiKey: runtimeEnv.ALIEN_API_KEY,
			project: runtimeEnv.ALIEN_PROJECT,
		}),
		HERALD_ATOM_PUSH_QUEUE_ONLY:
			runtimeEnv.NODE_ENV === "production" && !isStagingEnv({ runtimeEnv }),
		ECS_CONTAINER_METADATA_URI_V4: trimmedOrUndefined(
			runtimeEnv.ECS_CONTAINER_METADATA_URI_V4,
		),
		FC_GIT_COMMIT_SHA: trimmedOrUndefined(runtimeEnv.FC_GIT_COMMIT_SHA),
		IMAGE_TAG: trimmedOrUndefined(runtimeEnv.IMAGE_TAG),
	};
}

const trimmedOrUndefined = (value: string | undefined): string | undefined =>
	value?.trim() ? value.trim() : undefined;

export type HeraldEnv = ReturnType<typeof createHeraldEnv>;
let heraldEnv: HeraldEnv | undefined;

export function getHeraldEnv(): HeraldEnv {
	heraldEnv ??= createHeraldEnv(process.env);
	return heraldEnv;
}
