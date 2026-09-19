import { createBalanceWorkerClient } from "@autumn/balance-worker-client";
import {
	BALANCE_WORKER_PARTITION_COUNT,
	BALANCE_WORKER_REQUEST_TIMEOUT_MS,
} from "@autumn/env/balanceWorkerConstants";
import { initDrizzle } from "@server/db/initDrizzle.js";
import { createServerOwnershipConsumer } from "@server/external/balanceWorker/getOwnershipConsumer.js";
import { logger } from "@server/external/logtail/logtailUtils.js";
import type { BalanceShadowConfig } from "@server/internal/balances/shadow/balanceShadowTypes.js";
import { readBalanceShadowSubject } from "@server/internal/balances/shadow/operator/readBalanceShadowSubject.js";
import { runBalanceShadowCohort } from "@server/internal/balances/shadow/operator/runBalanceShadowCohort.js";
import { getCacheV2RampStatus } from "@server/internal/misc/cacheV2Ramp/cacheV2RampStore.js";
import { refreshAllEdgeConfigs } from "@server/internal/misc/edgeConfig/edgeConfigRegistry.js";
import { getRedisV2CacheStatus } from "@server/internal/misc/redisV2Cache/redisV2CacheStore.js";
import { loadShadowOperatorContext } from "./loadShadowOperatorContext.js";

/** The row keeps usage per attribution source, so the comparable total is the sum of its units. */
const attributedUnits = ({
	usage_attribution,
}: {
	usage_attribution?: Record<string, { units: number }>;
} = {}): number =>
	Object.values(usage_attribution ?? {}).reduce(
		(total, entry) => total + entry.units,
		0,
	);

export async function runShadowOperator({
	config,
	mode,
	execute,
}: {
	config: BalanceShadowConfig;
	mode: "initialize" | "compare";
	execute: boolean;
}) {
	await refreshAllEdgeConfigs({ logger });
	for (const status of [getCacheV2RampStatus(), getRedisV2CacheStatus()]) {
		if (
			!status.healthy &&
			(status.configured || process.env.NODE_ENV !== "development")
		)
			throw new Error(
				"Redis routing config is unavailable; refusing a guessed baseline",
			);
	}
	const owners = createServerOwnershipConsumer({
		topic: config.ownershipTopic,
		groupIdPrefix: "autumn-shadow-operator",
	});
	const client = createBalanceWorkerClient({
		ctx: { owners },
		config: {
			partitionCount: BALANCE_WORKER_PARTITION_COUNT,
			timeoutMs: BALANCE_WORKER_REQUEST_TIMEOUT_MS,
		},
	});
	const database = initDrizzle({
		maxConnections: 1,
		poolConfig: {
			options: "-c default_transaction_read_only=on",
			query_timeout: 5_000,
		},
	});
	try {
		return await runBalanceShadowCohort({
			config,
			mode,
			execute,
			dependencies: {
				owners,
				client,
				loadContext: (customer) =>
					loadShadowOperatorContext({ db: database.db, customer }),
				loadSubject: readBalanceShadowSubject,
				report: (result) => {
					console.log(JSON.stringify({ runId: config.runId, mode, ...result }));
					console.table(
						result.featureIds.map((featureId) => ({
							customer: result.customerId,
							feature: featureId,
							status: result.status,
							redisRemaining: result.redis?.[featureId]?.balance,
							workerRemaining: result.worker?.[featureId]?.balance,
							redisUsage: attributedUnits(result.redis?.[featureId]),
							workerUsage: attributedUnits(result.worker?.[featureId]),
							workerRevision: result.worker?.[featureId]?.revision,
						})),
					);
				},
			},
		});
	} finally {
		await database.client.end();
	}
}
