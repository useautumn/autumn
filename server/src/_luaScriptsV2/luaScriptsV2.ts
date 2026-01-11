import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to deductFromCustomerEntitlements folder (same directory as this file)
const DEDUCT_DIR = join(__dirname, "deductFromCustomerEntitlements");

// ============================================================================
// HELPER MODULES
// ============================================================================

const LUA_UTILS = readFileSync(join(DEDUCT_DIR, "luaUtils.lua"), "utf-8");

const READ_BALANCES = readFileSync(
	join(DEDUCT_DIR, "readBalances.lua"),
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
${DEDUCT_FROM_ROLLOVERS}
${DEDUCT_FROM_MAIN_BALANCE}
${mainScript}`;
