import type { MiscRedisInstanceName } from "@autumn/edge-config";
import type { Redis } from "ioredis";
import { createRedisClient } from "../client/createRedisClient.js";
import {
	forEachTarget,
	getFromTargets,
	mirrorSetOnRampTarget,
	setOnTargets,
} from "./miscCacheTargets.js";
import { getRequestBucket } from "./requestBucket.js";
import type {
	MiscCache,
	MiscCacheConfig,
	MiscCacheContext,
	MiscCacheTarget,
} from "./types/miscCache.js";

type BackupClient = {
	publicConnectionString: string;
	privateConnectionString: string | null;
	redis: Redis;
};

type MiscCacheState = {
	main: Redis | null;
	backup: BackupClient | null;
	lastDecryptFailureKey: string | null;
	lastLoggedInstance: MiscRedisInstanceName | null;
	warnedUnroutableBackup: boolean;
	warnedUnroutableRampTarget: boolean;
};

type MiscCacheScope = {
	ctx: MiscCacheContext;
	config: MiscCacheConfig;
	state: MiscCacheState;
};

/** Lazy on purpose: env may land after import, so the URL is read on first use and retried until it does. */
const getMain = ({ scope }: { scope: MiscCacheScope }): Redis => {
	const { ctx, config, state } = scope;
	if (state.main) return state.main;
	if (!ctx.env.mainUrl)
		throw new Error(
			"[Redis] misc cache is required — set MISC_CACHE_DRAGONFLY_PUBLIC_URL",
		);
	state.main = (ctx.createClient ?? createRedisClient)({
		ctx,
		config: {
			url: ctx.env.mainUrl,
			label: `${ctx.env.region}:misc-primary`,
			commandTimeoutMs: config.commandTimeoutMs,
		},
	});
	return state.main;
};

const closeBackup = ({ scope }: { scope: MiscCacheScope }): void => {
	const { ctx, state } = scope;
	if (!state.backup) return;
	try {
		state.backup.redis.disconnect();
	} catch (error) {
		ctx.logger?.warn(
			`[miscRedis] failed to disconnect old backup client: ${error}`,
		);
	}
	state.backup = null;
};

/** Hot-swappable: a changed or rotated connection disconnects the old client on the next call. Null while unconfigured or undecryptable. */
const getBackup = ({ scope }: { scope: MiscCacheScope }): Redis | null => {
	const { ctx, config, state } = scope;
	const backup = ctx.config().backup;
	if (!backup) {
		closeBackup({ scope });
		return null;
	}
	const { publicConnectionString, privateConnectionString, url } = backup;
	const unchanged =
		state.backup &&
		state.backup.publicConnectionString === publicConnectionString &&
		state.backup.privateConnectionString === privateConnectionString;
	if (state.backup && unchanged) return state.backup.redis;
	if (state.backup) {
		ctx.logger?.info(
			"[miscRedis] backup connection changed; disconnecting old client",
		);
		closeBackup({ scope });
	}

	const encrypted =
		ctx.env.onEcs && privateConnectionString
			? privateConnectionString
			: publicConnectionString;
	let decrypted: string;
	try {
		decrypted = ctx.decrypt(encrypted);
	} catch (error) {
		const failureKey = `${url}|${encrypted}`;
		if (state.lastDecryptFailureKey !== failureKey) {
			state.lastDecryptFailureKey = failureKey;
			ctx.logger?.error(
				`[miscRedis] failed to decrypt backup connection for ${url}: ${error}. Backup is unroutable until fixed.`,
			);
		}
		return null;
	}
	state.lastDecryptFailureKey = null;

	const redis = (ctx.createClient ?? createRedisClient)({
		ctx,
		config: {
			url: decrypted,
			label: `${ctx.env.region}:backup:misc-secondary`,
			commandTimeoutMs: config.commandTimeoutMs,
		},
	});
	redis.on("error", (error: Error) => {
		ctx.logger?.error(`[miscRedis] backup=${url}: ${error.message}`);
	});
	redis.on("ready", () => {
		ctx.logger?.info(`[miscRedis] backup=${url}: connected`);
	});
	state.backup = { publicConnectionString, privateConnectionString, redis };
	return redis;
};

/** The active instance per the edge config; a selected but unroutable backup falls back to main. */
const getActive = ({ scope }: { scope: MiscCacheScope }): Redis => {
	const { ctx, state } = scope;
	const activeInstance = ctx.config().activeInstance;
	if (activeInstance !== state.lastLoggedInstance) {
		ctx.logger?.info(`[miscRedis] active instance: ${activeInstance}`);
		state.lastLoggedInstance = activeInstance;
	}
	if (activeInstance === "backup") {
		const backup = getBackup({ scope });
		if (backup) return backup;
		if (!state.warnedUnroutableBackup) {
			state.warnedUnroutableBackup = true;
			ctx.logger?.warn(
				"[miscRedis] backup selected but not configured/decryptable; using main",
			);
		}
	}
	return getMain({ scope });
};

/** The ramp always flows toward the instance that is NOT active. */
const getRampTarget = ({ scope }: { scope: MiscCacheScope }): Redis | null =>
	scope.ctx.config().activeInstance === "main"
		? getBackup({ scope })
		: getMain({ scope });

const requestIsInRampSlice = ({
	requestId,
	percent,
}: {
	requestId: string;
	percent: number;
}): boolean => percent >= 100 || getRequestBucket({ requestId }) < percent;

const rampTargetOrActive = ({ scope }: { scope: MiscCacheScope }): Redis => {
	const rampTarget = getRampTarget({ scope });
	if (rampTarget) return rampTarget;
	if (!scope.state.warnedUnroutableRampTarget) {
		scope.state.warnedUnroutableRampTarget = true;
		scope.ctx.logger?.error(
			"[miscRedis] ramp target is not configured/decryptable; routing to the active instance",
		);
	}
	return getActive({ scope });
};

/** Only safe for keys where a miss recomputes from the source of truth; cross-request state and locks use `getActive`. */
const resolve = ({
	scope,
	requestId,
}: {
	scope: MiscCacheScope;
	requestId?: string;
}): Redis => {
	const { ramp } = scope.ctx.config();
	const rampIsLive = ramp !== null && ramp.percent > 0;
	if (!rampIsLive || !requestId) return getActive({ scope });
	if (!requestIsInRampSlice({ requestId, percent: ramp.percent }))
		return getActive({ scope });
	return rampTargetOrActive({ scope });
};

/** The active instance, plus the ramp target whenever a ramp exists, even at 0%, so invalidations fan out before traffic moves. */
const targets = ({ scope }: { scope: MiscCacheScope }): MiscCacheTarget[] => {
	const { activeInstance, ramp } = scope.ctx.config();
	const active: MiscCacheTarget = {
		instanceName: activeInstance,
		redis: getActive({ scope }),
	};
	if (!ramp) return [active];
	const rampTarget = getRampTarget({ scope });
	const rampTargetIsRoutable =
		rampTarget !== null && rampTarget !== active.redis;
	if (!rampTargetIsRoutable) return [active];
	const rampInstanceName: MiscRedisInstanceName =
		activeInstance === "main" ? "backup" : "main";
	return [active, { instanceName: rampInstanceName, redis: rampTarget }];
};

const close = ({ scope }: { scope: MiscCacheScope }): void => {
	closeBackup({ scope });
	scope.state.main?.disconnect();
	scope.state.main = null;
};

export const createMiscCache = ({
	ctx,
	config,
}: {
	ctx: MiscCacheContext;
	config: MiscCacheConfig;
}): MiscCache => {
	const scope: MiscCacheScope = {
		ctx,
		config,
		state: {
			main: null,
			backup: null,
			lastDecryptFailureKey: null,
			lastLoggedInstance: null,
			warnedUnroutableBackup: false,
			warnedUnroutableRampTarget: false,
		},
	};
	const targetsScope = {
		targets: () => targets({ scope }),
		activeInstanceName: () => ctx.config().activeInstance,
	};
	return {
		getActive: () => getActive({ scope }),
		getMain: () => getMain({ scope }),
		getBackup: () => getBackup({ scope }),
		resolve: ({ requestId }) => resolve({ scope, requestId }),
		targets: () => targets({ scope }),
		forEachTarget: (params) =>
			forEachTarget({ scope: targetsScope, ...params }),
		getFromTargets: (params) =>
			getFromTargets({ scope: targetsScope, ...params }),
		setOnTargets: (params) => setOnTargets({ scope: targetsScope, ...params }),
		mirrorSetOnRampTarget: (params) =>
			mirrorSetOnRampTarget({ scope: targetsScope, ...params }),
		close: () => close({ scope }),
	};
};
