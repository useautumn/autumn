import {
	configureMiscRedisConfigStore,
	createMiscRedisConfigStore,
	getActiveMiscRedisInstanceName,
	getConfiguredMiscRedisConfigStore,
	getMiscRedisConfig,
	getMiscRedisConfigStatus,
	_setMiscRedisConfigForTesting as setSharedMiscRedisConfigForTesting,
} from "@autumn/cache";
import type { AutumnLogger } from "@autumn/logging";
import { ErrCode, RecaseError } from "@autumn/shared";
import { getAdminS3Config } from "@/external/aws/s3/adminS3Config.js";
import {
	createBunS3EdgeConfigClient,
	type EdgeConfigS3Client,
} from "@/external/aws/s3/bunS3EdgeConfigClient.js";
import { logger } from "@/external/logtail/logtailUtils.js";
import { registerEdgeConfig } from "@/internal/misc/edgeConfig/edgeConfigRegistry.js";
import { writeEdgeConfigTimestamp } from "@/internal/misc/edgeConfig/edgeConfigTimestamp.js";
import {
	type MiscRedisConfig,
	type MiscRedisInstanceName,
	otherMiscRedisInstance,
} from "./miscRedisConfigSchemas.js";

const store = createMiscRedisConfigStore({
	getLocation: getAdminS3Config,
	createS3Client: ({ region }) =>
		createBunS3EdgeConfigClient({ region }) as EdgeConfigS3Client,
	logger: logger as AutumnLogger,
	afterWrite: writeEdgeConfigTimestamp,
});

configureMiscRedisConfigStore({ store });
registerEdgeConfig({ store });

export {
	getActiveMiscRedisInstanceName,
	getMiscRedisConfig,
	getMiscRedisConfigStatus,
};

/**
 * Point the misc cache at an instance. Always clears the ramp: flipping IS the
 * cutover (toward the ramp target) or the rollback (away from it).
 */
export const setActiveMiscRedisInstance = async ({
	activeInstance,
}: {
	activeInstance: MiscRedisInstanceName;
}) => {
	const current = await getConfiguredMiscRedisConfigStore().readFromSource();
	if (activeInstance === "backup" && !current.backup) {
		throw new RecaseError({
			message: "No backup connection is configured.",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
	await getConfiguredMiscRedisConfigStore().writeToSource({
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
	const current = await getConfiguredMiscRedisConfigStore().readFromSource();
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
	await getConfiguredMiscRedisConfigStore().writeToSource({
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
	const current = await getConfiguredMiscRedisConfigStore().readFromSource();
	if (!current.ramp) {
		throw new RecaseError({
			message: "No misc Redis ramp is configured.",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
	await getConfiguredMiscRedisConfigStore().writeToSource({
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
	const current = await getConfiguredMiscRedisConfigStore().readFromSource();
	await getConfiguredMiscRedisConfigStore().writeToSource({
		config: { ...current, ramp: null },
	});
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
	const current = await getConfiguredMiscRedisConfigStore().readFromSource();
	if (backupIsLive(current)) {
		throw new RecaseError({
			message:
				"Cannot update the backup connection while it is active or a ramp target.",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
	await getConfiguredMiscRedisConfigStore().writeToSource({
		config: {
			...current,
			backup: { publicConnectionString, privateConnectionString, url },
		},
	});
};

export const removeMiscRedisBackupConfig = async () => {
	const current = await getConfiguredMiscRedisConfigStore().readFromSource();
	if (backupIsLive(current)) {
		throw new RecaseError({
			message:
				"Cannot remove the backup connection while it is active or a ramp target.",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
	await getConfiguredMiscRedisConfigStore().writeToSource({
		config: { ...current, backup: null },
	});
};

/** Test-only: override the in-memory config without writing to S3. */
export const _setMiscRedisConfigForTesting = (
	config: Partial<MiscRedisConfig>,
) => {
	setSharedMiscRedisConfigForTesting(config);
};
