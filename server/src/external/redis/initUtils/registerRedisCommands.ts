import type { Redis } from "ioredis";
import {
	ADJUST_CUSTOMER_ENTITLEMENT_BALANCE_SCRIPT,
	ADJUST_SUBJECT_BALANCE_SCRIPT,
	APPEND_ENTITY_TO_CUSTOMER_SCRIPT,
	DEDUCT_FROM_SUBJECT_BALANCES_SCRIPT,
	DELETE_FULL_CUSTOMER_CACHE_SCRIPT,
	GETDEL_SHARED_BALANCE_FIELDS_SCRIPT,
	ROLL_USAGE_WINDOWS_SCRIPT,
	SET_CACHED_FULL_SUBJECT_SCRIPT,
	UPDATE_CACHED_INVOICE_V2_SCRIPT,
	UPDATE_CUSTOMER_DATA_SCRIPT,
	UPDATE_CUSTOMER_DATA_V2_SCRIPT,
	UPDATE_CUSTOMER_ENTITLEMENTS_SCRIPT,
	UPDATE_CUSTOMER_PRODUCT_SCRIPT,
	UPDATE_CUSTOMER_PRODUCT_V2_SCRIPT,
	UPDATE_ENTITY_DATA_V2_SCRIPT,
	UPDATE_ENTITY_IN_CUSTOMER_SCRIPT,
	UPDATE_SUBJECT_BALANCES_SCRIPT,
	UPSERT_INVOICE_IN_CUSTOMER_SCRIPT,
	UPSTASH_KEY_LOCKING_SHEBANG,
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
 * The dedup state is closed over PER instance (not module-level), so a regional
 * Redis's error is never swallowed just because the primary logged the same
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

/** Configure a Redis instance with custom commands.
 *  `supportsUpstashShebang` controls whether the `#!lua flags=allow-key-locking`
 *  shebang is kept on V2 scripts. Upstash requires it for per-key locking;
 *  other Redis providers (ElastiCache, Dragonfly, self-hosted) reject it with
 *  `ERR Unexpected flag in script shebang`. Defaults to true. */
export const registerRedisCommands = ({
	redisInstance,
	supportsUpstashShebang = true,
}: {
	redisInstance: Redis;
	supportsUpstashShebang?: boolean;
}): Redis => {
	const logRedisConnectionError = makeRedisErrorLogger();
	const prepareScript = (script: string): string =>
		supportsUpstashShebang ? `${UPSTASH_KEY_LOCKING_SHEBANG}${script}` : script;

	redisInstance.defineCommand("deductFromSubjectBalances", {
		lua: prepareScript(DEDUCT_FROM_SUBJECT_BALANCES_SCRIPT),
	});

	redisInstance.defineCommand("updateSubjectBalances", {
		numberOfKeys: 1,
		lua: prepareScript(UPDATE_SUBJECT_BALANCES_SCRIPT),
	});

	redisInstance.defineCommand("rollUsageWindows", {
		numberOfKeys: 1,
		lua: prepareScript(ROLL_USAGE_WINDOWS_SCRIPT),
	});

	redisInstance.defineCommand("deleteFullCustomerCache", {
		numberOfKeys: 4,
		lua: DELETE_FULL_CUSTOMER_CACHE_SCRIPT,
	});

	redisInstance.defineCommand("setCachedFullSubject", {
		lua: prepareScript(SET_CACHED_FULL_SUBJECT_SCRIPT),
	});

	redisInstance.defineCommand("updateCustomerEntitlements", {
		numberOfKeys: 1,
		lua: UPDATE_CUSTOMER_ENTITLEMENTS_SCRIPT,
	});

	redisInstance.defineCommand("updateCustomerData", {
		numberOfKeys: 1,
		lua: UPDATE_CUSTOMER_DATA_SCRIPT,
	});

	redisInstance.defineCommand("updateFullSubjectCustomerDataV2", {
		numberOfKeys: 1,
		lua: prepareScript(UPDATE_CUSTOMER_DATA_V2_SCRIPT),
	});

	redisInstance.defineCommand("updateFullSubjectEntityDataV2", {
		numberOfKeys: 1,
		lua: prepareScript(UPDATE_ENTITY_DATA_V2_SCRIPT),
	});

	redisInstance.defineCommand("getDelFullSubjectBalanceFields", {
		lua: prepareScript(GETDEL_SHARED_BALANCE_FIELDS_SCRIPT),
	});

	redisInstance.defineCommand("updateFullSubjectCustomerProductV2", {
		numberOfKeys: 1,
		lua: prepareScript(UPDATE_CUSTOMER_PRODUCT_V2_SCRIPT),
	});

	redisInstance.defineCommand("upsertInvoiceInFullSubjectV2", {
		numberOfKeys: 1,
		lua: prepareScript(UPDATE_CACHED_INVOICE_V2_SCRIPT),
	});

	redisInstance.defineCommand("appendEntityToCustomer", {
		numberOfKeys: 1,
		lua: APPEND_ENTITY_TO_CUSTOMER_SCRIPT,
	});

	redisInstance.defineCommand("updateEntityInCustomer", {
		numberOfKeys: 1,
		lua: UPDATE_ENTITY_IN_CUSTOMER_SCRIPT,
	});

	redisInstance.defineCommand("upsertInvoiceInCustomer", {
		numberOfKeys: 1,
		lua: UPSERT_INVOICE_IN_CUSTOMER_SCRIPT,
	});

	redisInstance.defineCommand("adjustCustomerEntitlementBalance", {
		numberOfKeys: 1,
		lua: ADJUST_CUSTOMER_ENTITLEMENT_BALANCE_SCRIPT,
	});

	redisInstance.defineCommand("adjustSubjectBalance", {
		numberOfKeys: 1,
		lua: prepareScript(ADJUST_SUBJECT_BALANCE_SCRIPT),
	});

	redisInstance.defineCommand("updateCustomerProduct", {
		numberOfKeys: 1,
		lua: UPDATE_CUSTOMER_PRODUCT_SCRIPT,
	});

	redisInstance.on("error", (error) => {
		logRedisConnectionError(error.message);
	});

	return redisInstance;
};
