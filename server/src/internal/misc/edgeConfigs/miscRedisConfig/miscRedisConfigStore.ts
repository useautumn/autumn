import { ErrCode, ms, RecaseError } from "@autumn/shared";
import { ADMIN_MAIN_REDIS_CACHE_CONFIG_KEY } from "@/external/aws/s3/adminS3Config.js";
import { registerEdgeConfig } from "@/internal/misc/edgeConfigs/edgeConfigRegistry.js";
import { createEdgeConfigStore } from "@/internal/misc/edgeConfigs/edgeConfigStore.js";
import {
	type MiscRedisConfig,
	MiscRedisConfigSchema,
	type MiscRedisInstanceName,
	otherMiscRedisInstance,
} from "./miscRedisConfigSchemas.js";

// S3 key predates the misc rename; renaming it is config-breaking, so it stays.
const store = createEdgeConfigStore<MiscRedisConfig>({
	s3Key: ADMIN_MAIN_REDIS_CACHE_CONFIG_KEY,
	schema: MiscRedisConfigSchema,
	defaultValue: () => ({ activeInstance: "main", ramp: null, backup: null }),
	pollIntervalMs: ms.seconds(10),
});

registerEdgeConfig({ store });

export const getMiscRedisConfig = (): MiscRedisConfig => store.get();

export const getMiscRedisConfigStatus = () => store.getStatus();

export const getActiveMiscRedisInstanceName = (): MiscRedisInstanceName =>
	store.get().activeInstance;

/**
 * Point the misc cache at an instance. Always clears the ramp: flipping IS the
 * cutover (toward the ramp target) or the rollback (away from it).
 */
export const setActiveMiscRedisInstance = async ({
	activeInstance,
}: {
	activeInstance: MiscRedisInstanceName;
}) => {
	const current = await store.readFromSource();
	if (activeInstance === "backup" && !current.backup) {
		throw new RecaseError({
			message: "No backup connection is configured.",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
	await store.writeToSource({
		config: { ...current, activeInstance, ramp: null },
	});
};

/**
 * Start the ramp toward the non-active instance. Configure at 0% first:
 * invalidations start fanning out to the target as soon as the ramp exists,
 * which closes the stale-read race before any traffic moves.
 */
export const startMiscRedisRamp = async ({
	percent = 0,
}: {
	percent?: number;
} = {}) => {
	const current = await store.readFromSource();
	if (current.ramp) {
		throw new RecaseError({
			message: "A ramp is already active. Update its percent instead.",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
	if (
		otherMiscRedisInstance(current.activeInstance) === "backup" &&
		!current.backup
	) {
		throw new RecaseError({
			message: "No backup connection is configured to ramp toward.",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
	await store.writeToSource({
		config: {
			...current,
			ramp: { percent, previousPercent: 0, changedAt: Date.now() },
		},
	});
};

export const updateMiscRedisRampPercent = async ({
	percent,
}: {
	percent: number;
}) => {
	const current = await store.readFromSource();
	if (!current.ramp) {
		throw new RecaseError({
			message: "No misc Redis ramp is configured.",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
	await store.writeToSource({
		config: {
			...current,
			ramp: {
				previousPercent: current.ramp.percent,
				percent,
				changedAt: Date.now(),
			},
		},
	});
};

/** Instant rollback: all ramped traffic returns to the active instance. */
export const clearMiscRedisRamp = async () => {
	const current = await store.readFromSource();
	await store.writeToSource({ config: { ...current, ramp: null } });
};

/** True whenever any traffic can be routed at the backup. */
const backupIsLive = (config: MiscRedisConfig) =>
	config.activeInstance === "backup" ||
	(config.ramp !== null && config.activeInstance === "main");

/** Upsert the S3-stored (encrypted) backup instance. Refused while the backup
 *  is live so credentials can't rotate under traffic. */
export const upsertMiscRedisBackupConnection = async ({
	publicConnectionString,
	privateConnectionString = null,
	url,
}: {
	publicConnectionString: string;
	privateConnectionString?: string | null;
	url: string;
}) => {
	const current = await store.readFromSource();
	if (backupIsLive(current)) {
		throw new RecaseError({
			message:
				"Cannot update the backup connection while it is active or a ramp target.",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
	await store.writeToSource({
		config: {
			...current,
			backup: { publicConnectionString, privateConnectionString, url },
		},
	});
};

export const removeMiscRedisBackupConfig = async () => {
	const current = await store.readFromSource();
	if (backupIsLive(current)) {
		throw new RecaseError({
			message:
				"Cannot remove the backup connection while it is active or a ramp target.",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
	await store.writeToSource({ config: { ...current, backup: null } });
};

/** Test-only: override the in-memory config without writing to S3. */
export const _setMiscRedisConfigForTesting = (
	config: Partial<MiscRedisConfig>,
) => {
	store._setRuntimeConfigForTesting({
		activeInstance: "main",
		ramp: null,
		backup: null,
		...config,
	});
};
