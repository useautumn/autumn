import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to _luaScriptsV2 folder (4 levels up from this file)
const LUA_SCRIPTS_V2_DIR = join(__dirname, "../../../../_luaScriptsV2");

// ============================================================================
// MAIN SCRIPTS
// ============================================================================

/**
 * Lua script for deducting from customer entitlements in Redis.
 * Uses JSON.NUMINCRBY for atomic incremental updates to prevent race conditions.
 * The script is self-contained with all helper functions inline.
 * Supports both positive deductions and negative refunds.
 * Refund logic: PASS 1 recovers overage (negative balance → 0), PASS 2 restores prepaid (balance → max_balance).
 */
export const DEDUCT_FROM_CUSTOMER_ENTITLEMENTS_SCRIPT = readFileSync(
	join(
		LUA_SCRIPTS_V2_DIR,
		"deductFromCustomerEntitlements/deductFromCustomerEntitlements.lua",
	),
	"utf-8",
);
