import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to _luaScriptsV2 folder (4 levels up from this file)
const LUA_SCRIPTS_V2_DIR = join(__dirname, "../../../../_luaScriptsV2");

// ============================================================================
// HELPER SCRIPTS (deductFromCustomerEntitlements/)
// ============================================================================

const DEDUCT_FROM_MAIN_BALANCE = readFileSync(
	join(
		LUA_SCRIPTS_V2_DIR,
		"deductFromCustomerEntitlements/deductFromMainBalance.lua",
	),
	"utf-8",
);

// ============================================================================
// MAIN SCRIPTS
// ============================================================================

const deductFromCustomerEntitlementsScript = readFileSync(
	join(
		LUA_SCRIPTS_V2_DIR,
		"deductFromCustomerEntitlements/deductFromCustomerEntitlements.lua",
	),
	"utf-8",
);

/**
 * Lua script for deducting from customer entitlements in Redis
 * Mirrors the SQL function deduct_from_cus_ents in performDeduction.sql
 */
export const DEDUCT_FROM_CUSTOMER_ENTITLEMENTS_SCRIPT = `${DEDUCT_FROM_MAIN_BALANCE}\n${deductFromCustomerEntitlementsScript}`;

