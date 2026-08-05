import type { Redis } from "ioredis";
import {
	ACQUIRE_QUEUE_PERMITS_SCRIPT,
	DELETE_OWNED_LOCK_SCRIPT,
	REFRESH_OWNED_LOCK_SCRIPT,
	RELEASE_QUEUE_PERMIT_SCRIPT,
} from "../../../_luaScriptsMisc/luaScriptsMisc.js";
import {
	ADJUST_SUBJECT_BALANCE_SCRIPT,
	DEDUCT_FROM_SUBJECT_BALANCES_SCRIPT,
	GETDEL_SHARED_BALANCE_FIELDS_SCRIPT,
	ROLL_USAGE_WINDOWS_SCRIPT,
	SET_CACHED_FULL_SUBJECT_SCRIPT,
	UPDATE_CACHED_INVOICE_V2_SCRIPT,
	UPDATE_CUSTOMER_DATA_V2_SCRIPT,
	UPDATE_CUSTOMER_PRODUCT_V2_SCRIPT,
	UPDATE_ENTITY_DATA_V2_SCRIPT,
	UPDATE_SUBJECT_BALANCES_SCRIPT,
} from "../../../_luaScriptsV2/luaScriptsV2.js";

const REDIS_ERROR_LOG_COOLDOWN_MS = 30_000;

/**
 * Build a per-instance deduping logger for ioredis "error" events so an
 * unreachable Redis doesn't spam the log tens of times a second. This is what
 * otherwise floods `bun tw` µVM boot with `[Redis] Connection error: ECONNREFUSED
 * 127.0.0.1:6379` while Dragonfly is still starting (ioredis reconnects ~every
 * 50ms). Logs the first occurrence of a message, then suppresses repeats of the
 * SAME message within the cooldown. Prod-safe: a real, persistent error is still
 * surfaced (once per cooldown).
 *
 * The dedup state is closed over PER instance (not module-level), so one
 * connection's error is never swallowed just because another logged the same
 * string recently — each connection dedupes independently.
 */
const makeRedisErrorLogger = (): ((message: string) => void) => {
	let lastMessage: string | undefined;
	let lastLoggedAt = 0;
	return (message: string): void => {
		const now = Date.now();
		if (
			message === lastMessage &&
			now - lastLoggedAt < REDIS_ERROR_LOG_COOLDOWN_MS
		) {
			return;
		}
		lastMessage = message;
		lastLoggedAt = now;
		console.error("[Redis] Connection error:", message);
	};
};

/** Configure a Redis instance with the FullSubject (V2 cache) custom commands. */
export const registerRedisCommands = ({
	redisInstance,
}: {
	redisInstance: Redis;
}): Redis => {
	const logRedisConnectionError = makeRedisErrorLogger();

	redisInstance.defineCommand("deductFromSubjectBalances", {
		lua: DEDUCT_FROM_SUBJECT_BALANCES_SCRIPT,
	});

	redisInstance.defineCommand("updateSubjectBalances", {
		numberOfKeys: 1,
		lua: UPDATE_SUBJECT_BALANCES_SCRIPT,
	});

	redisInstance.defineCommand("rollUsageWindows", {
		numberOfKeys: 1,
		lua: ROLL_USAGE_WINDOWS_SCRIPT,
	});

	redisInstance.defineCommand("setCachedFullSubject", {
		lua: SET_CACHED_FULL_SUBJECT_SCRIPT,
	});

	redisInstance.defineCommand("updateFullSubjectCustomerDataV2", {
		numberOfKeys: 1,
		lua: UPDATE_CUSTOMER_DATA_V2_SCRIPT,
	});

	redisInstance.defineCommand("updateFullSubjectEntityDataV2", {
		numberOfKeys: 1,
		lua: UPDATE_ENTITY_DATA_V2_SCRIPT,
	});

	redisInstance.defineCommand("getDelFullSubjectBalanceFields", {
		lua: GETDEL_SHARED_BALANCE_FIELDS_SCRIPT,
	});

	redisInstance.defineCommand("updateFullSubjectCustomerProductV2", {
		numberOfKeys: 1,
		lua: UPDATE_CUSTOMER_PRODUCT_V2_SCRIPT,
	});

	redisInstance.defineCommand("upsertInvoiceInFullSubjectV2", {
		numberOfKeys: 1,
		lua: UPDATE_CACHED_INVOICE_V2_SCRIPT,
	});

	redisInstance.defineCommand("adjustSubjectBalance", {
		numberOfKeys: 1,
		lua: ADJUST_SUBJECT_BALANCE_SCRIPT,
	});

	redisInstance.defineCommand("deleteOwnedLock", {
		numberOfKeys: 1,
		lua: DELETE_OWNED_LOCK_SCRIPT,
	});

	redisInstance.defineCommand("refreshOwnedLock", {
		numberOfKeys: 1,
		lua: REFRESH_OWNED_LOCK_SCRIPT,
	});

	redisInstance.defineCommand("acquireQueuePermits", {
		numberOfKeys: 1,
		lua: ACQUIRE_QUEUE_PERMITS_SCRIPT,
	});

	redisInstance.defineCommand("releaseQueuePermit", {
		numberOfKeys: 1,
		lua: RELEASE_QUEUE_PERMIT_SCRIPT,
	});

	redisInstance.on("error", (error) => {
		logRedisConnectionError(error.message);
	});

	return redisInstance;
};
