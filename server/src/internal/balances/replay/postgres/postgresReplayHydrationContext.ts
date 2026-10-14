import type { MeteringIdentity } from "@autumn/balance-engine";
import {
	type ApiVersionClass,
	type AppEnv,
	AuthType,
	createdAtToVersion,
	type Feature,
	type Organization,
} from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { ReplayHydrationBaseline } from "../replayHydrationContracts.js";
import { PostgresReplayRedisUnavailableError } from "./postgresReplayHydrationErrors.js";

export type ReplayContextMetadata = Readonly<{
	identity: MeteringIdentity;
	env: AppEnv;
	baseline: ReplayHydrationBaseline;
	org: Organization;
	features: Feature[];
	apiVersion: ApiVersionClass;
}>;

export function buildReplayContextMetadata({
	identity,
	env,
	baseline,
	org,
	features,
}: {
	identity: MeteringIdentity;
	env: AppEnv;
	baseline: ReplayHydrationBaseline;
	org: Organization;
	features: Feature[];
}): ReplayContextMetadata {
	return {
		identity,
		env,
		baseline,
		org,
		features,
		apiVersion: createdAtToVersion({ createdAt: org.created_at ?? undefined }),
	};
}

function throwRedisUnavailable(): never {
	throw new PostgresReplayRedisUnavailableError();
}

export function createReplayHydrationContext({
	metadata,
	db,
	logger,
}: {
	metadata: ReplayContextMetadata;
	db: DrizzleCli;
	logger: Logger;
}): AutumnContext {
	const { identity, env, baseline, org, features, apiVersion } = metadata;
	const context: Omit<AutumnContext, "redisV2"> = {
		org,
		env,
		features,
		customerId: identity.customerId,

		db,
		dbGeneral: db,
		logger,

		id: `replay:${baseline.id}:${identity.customerId}`,
		isPublic: false,
		authType: AuthType.Worker,
		apiVersion,
		timestamp: baseline.capturedAtMs,
		scopes: [],
		expand: [],
		skipCache: true,
		extraLogs: {},
		state: {},
	};
	Object.defineProperty(context, "redisV2", {
		configurable: false,
		enumerable: false,
		get: throwRedisUnavailable,
	});
	return context as AutumnContext;
}
