import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to script folders
const DEDUCT_DIR = join(__dirname, "deductFromCustomerEntitlements");
const DELETE_CACHE_DIR = join(__dirname, "deleteFullCustomerCache");
const RESET_DIR = join(__dirname, "resetCustomerEntitlements");

// ============================================================================
// HELPER MODULES
// ============================================================================

const LUA_UTILS = readFileSync(join(DEDUCT_DIR, "luaUtils.lua"), "utf-8");

const READ_BALANCES = readFileSync(
	join(DEDUCT_DIR, "readBalances.lua"),
	"utf-8",
);

const CONTEXT_UTILS = readFileSync(
	join(DEDUCT_DIR, "contextUtils.lua"),
	"utf-8",
);

const GET_TOTAL_BALANCE = readFileSync(
	join(DEDUCT_DIR, "getTotalBalance.lua"),
	"utf-8",
);

const DEDUCT_FROM_ROLLOVERS = readFileSync(
	join(DEDUCT_DIR, "deductFromRollovers.lua"),
	"utf-8",
);

const DEDUCT_FROM_MAIN_BALANCE = readFileSync(
	join(DEDUCT_DIR, "deductFromMainBalance.lua"),
	"utf-8",
);

// ============================================================================
// MAIN SCRIPT
// ============================================================================

const mainScript = readFileSync(
	join(DEDUCT_DIR, "deductFromCustomerEntitlements.lua"),
	"utf-8",
);

/**
 * Lua script for deducting from customer entitlements in Redis.
 * Uses JSON.NUMINCRBY for atomic incremental updates to prevent race conditions.
 * Composed from helper modules via string interpolation.
 * Supports both positive deductions and negative refunds.
 */
export const DEDUCT_FROM_CUSTOMER_ENTITLEMENTS_SCRIPT = `${LUA_UTILS}
${READ_BALANCES}
${CONTEXT_UTILS}
${GET_TOTAL_BALANCE}
${DEDUCT_FROM_ROLLOVERS}
${DEDUCT_FROM_MAIN_BALANCE}
${mainScript}`;

// ============================================================================
// DELETE FULL CUSTOMER CACHE SCRIPTS
// ============================================================================

/**
 * Lua script for deleting a single FullCustomer cache from Redis.
 * Checks test guard, sets stale-write guard, and deletes cache atomically.
 */
export const DELETE_FULL_CUSTOMER_CACHE_SCRIPT = readFileSync(
	join(DELETE_CACHE_DIR, "deleteFullCustomerCache.lua"),
	"utf-8",
);

/**
 * Lua script for setting a FullCustomer cache in Redis.
 * Checks stale-write guard, checks if cache exists, and sets cache atomically.
 */
export const SET_FULL_CUSTOMER_CACHE_SCRIPT = readFileSync(
	join(DELETE_CACHE_DIR, "setFullCustomerCache.lua"),
	"utf-8",
);

/**
 * Lua script for batch deleting multiple FullCustomer caches from Redis.
 * For each customer: checks test guard, sets stale-write guard, deletes cache.
 */
export const BATCH_DELETE_FULL_CUSTOMER_CACHE_SCRIPT = readFileSync(
	join(DELETE_CACHE_DIR, "batchDeleteFullCustomerCache.lua"),
	"utf-8",
);

// ============================================================================
// RESET CUSTOMER ENTITLEMENTS SCRIPT
// ============================================================================

const resetMainScript = readFileSync(
	join(RESET_DIR, "resetCustomerEntitlements.lua"),
	"utf-8",
);

/**
 * Lua script for atomically resetting cusEnt fields in the cached FullCustomer.
 * Reuses luaUtils helpers for find_entitlement navigation.
 * Skips if cache doesn't exist or cusEnt already reset (optimistic guard).
 */
export const RESET_CUSTOMER_ENTITLEMENTS_SCRIPT = `${LUA_UTILS}
${resetMainScript}`;
