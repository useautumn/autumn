import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to script folders
const DEDUCT_DIR = join(__dirname, "deductFromCustomerEntitlements");
const DEDUCTION_DIR = join(__dirname, "deduction");
const LOCK_DIR = join(DEDUCTION_DIR, "lock");
const DELETE_CACHE_DIR = join(__dirname, "deleteFullCustomerCache");
const RESET_DIR = join(__dirname, "resetCustomerEntitlements");
const UPDATE_DIR = join(__dirname, "updateCustomerEntitlements");

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

const RUN_DEDUCTION_ON_CONTEXT = readFileSync(
	join(DEDUCT_DIR, "runDeductionOnContext.lua"),
	"utf-8",
);

const SPEND_LIMIT_UTILS = readFileSync(
	join(DEDUCT_DIR, "spendLimitUtils.lua"),
	"utf-8",
);

const MUTATION_ITEM_UTILS = readFileSync(
	join(DEDUCTION_DIR, "mutationItemUtils.lua"),
	"utf-8",
);

const LOCK_RECEIPT_UTILS = readFileSync(
	join(LOCK_DIR, "lockReceipt.lua"),
	"utf-8",
);

const LOCK_STATE_UTILS = readFileSync(
	join(LOCK_DIR, "lockStateUtils.lua"),
	"utf-8",
);

const LOCK_UNWIND_UTILS = readFileSync(
	join(LOCK_DIR, "unwindLockUtils.lua"),
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
${SPEND_LIMIT_UTILS}
${RUN_DEDUCTION_ON_CONTEXT}
${MUTATION_ITEM_UTILS}
${LOCK_RECEIPT_UTILS}
${LOCK_STATE_UTILS}
${LOCK_UNWIND_UTILS}
${mainScript}`;

const claimLockReceiptMainScript = readFileSync(
	join(LOCK_DIR, "claimLockReceipt.lua"),
	"utf-8",
);

/**
 * Atomically claims a lock receipt by transitioning status: pending → processing.
 * KEYS[1]: lock_receipt_key
 * Returns nil on success, or an error code string if not claimable.
 */
export const CLAIM_LOCK_RECEIPT_SCRIPT = `${LUA_UTILS}
${LOCK_RECEIPT_UTILS}
${LOCK_STATE_UTILS}
${claimLockReceiptMainScript}`;

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
// RESET CUSTOMER ENTITLEMENTS SCRIPT (deprecated — kept for backward compat)
// ============================================================================

const resetMainScript = readFileSync(
	join(RESET_DIR, "resetCustomerEntitlements.lua"),
	"utf-8",
);

/**
 * @deprecated Use UPDATE_CUSTOMER_ENTITLEMENTS_SCRIPT instead.
 */
export const RESET_CUSTOMER_ENTITLEMENTS_SCRIPT = `${LUA_UTILS}
${resetMainScript}`;

// ============================================================================
// UPDATE CUSTOMER ENTITLEMENTS SCRIPT (unified reset + deduction cache update)
// ============================================================================

const updateMainScript = readFileSync(
	join(UPDATE_DIR, "updateCustomerEntitlements.lua"),
	"utf-8",
);

/**
 * Unified Lua script for atomically updating cusEnt fields in the cached
 * FullCustomer. Handles both reset and deduction cache updates — both are
 * "apply absolute values to customer entitlements in the Redis cache."
 */
export const UPDATE_CUSTOMER_ENTITLEMENTS_SCRIPT = `${LUA_UTILS}
${updateMainScript}`;

// ============================================================================
// ADJUST CUSTOMER ENTITLEMENT BALANCE SCRIPT
// ============================================================================

const CUS_ENT_DIR = join(__dirname, "customerEntitlements");

const adjustBalanceMainScript = readFileSync(
	join(CUS_ENT_DIR, "adjustCustomerEntitlementBalance.lua"),
	"utf-8",
);

/**
 * Lua script for atomically incrementing a cusEnt balance in the cached
 * FullCustomer via JSON.NUMINCRBY. Safe with concurrent deductions.
 */
export const ADJUST_CUSTOMER_ENTITLEMENT_BALANCE_SCRIPT = `${LUA_UTILS}
${adjustBalanceMainScript}`;

// ============================================================================
// CUSTOMER SCRIPTS (top-level customer fields, entities, invoices)
// ============================================================================

const CUSTOMER_DIR = join(__dirname, "customers");

const updateCustomerDataMainScript = readFileSync(
	join(CUSTOMER_DIR, "updateCustomerData.lua"),
	"utf-8",
);

/** Atomically update top-level customer fields (name, email, metadata, etc.). */
export const UPDATE_CUSTOMER_DATA_SCRIPT = `${LUA_UTILS}
${updateCustomerDataMainScript}`;

/**
 * Atomically append an entity to the customer's entities array.
 * CRDT-safe: JSON.ARRAPPEND uses merge conflict resolution in Active-Active.
 */
export const APPEND_ENTITY_TO_CUSTOMER_SCRIPT = readFileSync(
	join(CUSTOMER_DIR, "appendEntityToCustomer.lua"),
	"utf-8",
);

/**
 * Atomically update specific fields on an entity inside the cached FullCustomer.
 */
export const UPDATE_ENTITY_IN_CUSTOMER_SCRIPT = readFileSync(
	join(CUSTOMER_DIR, "updateEntityInCustomer.lua"),
	"utf-8",
);

/**
 * Atomically upsert an invoice in the customer's invoices array.
 * Matches by stripe_id — replaces if found, appends if not.
 * CRDT-safe: JSON.ARRAPPEND uses merge, JSON.SET uses update-vs-update.
 */
export const UPSERT_INVOICE_IN_CUSTOMER_SCRIPT = readFileSync(
	join(CUSTOMER_DIR, "upsertInvoice.lua"),
	"utf-8",
);

// ============================================================================
// CUSTOMER PRODUCT SCRIPTS
// ============================================================================

const CUS_PRODUCT_DIR = join(__dirname, "customerProducts");

/**
 * Atomically update specific fields on a cusProduct in the cached FullCustomer.
 * CRDT-safe: JSON.SET on specific paths uses "update vs update" resolution.
 */
export const UPDATE_CUSTOMER_PRODUCT_SCRIPT = readFileSync(
	join(CUS_PRODUCT_DIR, "updateCustomerProduct.lua"),
	"utf-8",
);
