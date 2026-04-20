import { FULL_CUSTOMER_CACHE_VERSION } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/fullCustomerCacheConfig.js";

// ============================================================================
// HELPER MODULES (imported as text — works with both Bun and esbuild)
// ============================================================================

import LUA_UTILS from "./deductFromCustomerEntitlements/luaUtils.lua";
import FULL_CUSTOMER_UTILS from "./fullCustomer/fullCustomerUtils.lua";
import READ_BALANCES from "./deductFromCustomerEntitlements/readBalances.lua";
import CONTEXT_UTILS from "./deductFromCustomerEntitlements/contextUtils.lua";
import GET_TOTAL_BALANCE from "./deductFromCustomerEntitlements/getTotalBalance.lua";
import DEDUCT_FROM_ROLLOVERS from "./deductFromCustomerEntitlements/deductFromRollovers.lua";
import DEDUCT_FROM_MAIN_BALANCE from "./deductFromCustomerEntitlements/deductFromMainBalance.lua";
import RUN_DEDUCTION_ON_CONTEXT from "./deductFromCustomerEntitlements/runDeductionOnContext.lua";
import SPEND_LIMIT_UTILS from "./deductFromCustomerEntitlements/spendLimitUtils.lua";
import MUTATION_ITEM_UTILS from "./deduction/mutationItemUtils.lua";
import LOCK_RECEIPT_UTILS from "./deduction/lock/lockReceipt.lua";
import LOCK_STATE_UTILS from "./deduction/lock/lockStateUtils.lua";
import LOCK_UNWIND_UTILS from "./deduction/lock/unwindLockUtils.lua";

// ============================================================================
// FULL CUSTOMER KEY BUILDER LUA (version interpolated from TS config)
// ============================================================================

import FULL_CUSTOMER_KEY_BUILDERS_RAW from "./fullCustomerKeyBuilders.lua";

const FULL_CUSTOMER_KEY_BUILDERS = FULL_CUSTOMER_KEY_BUILDERS_RAW.replaceAll(
	"__FULL_CUSTOMER_CACHE_VERSION__",
	FULL_CUSTOMER_CACHE_VERSION,
);

// ============================================================================
// MAIN SCRIPT
// ============================================================================

import mainScript from "./deductFromCustomerEntitlements/deductFromCustomerEntitlements.lua";

export const DEDUCT_FROM_CUSTOMER_ENTITLEMENTS_SCRIPT = `${FULL_CUSTOMER_KEY_BUILDERS}
${LUA_UTILS}
${FULL_CUSTOMER_UTILS}
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

import claimLockReceiptMainScript from "./deduction/lock/claimLockReceipt.lua";

export const CLAIM_LOCK_RECEIPT_SCRIPT = `${LUA_UTILS}
${LOCK_RECEIPT_UTILS}
${LOCK_STATE_UTILS}
${claimLockReceiptMainScript}`;

// ============================================================================
// DELETE FULL CUSTOMER CACHE SCRIPTS
// ============================================================================

import deleteFullCustomerCacheScript from "./deleteFullCustomerCache/deleteFullCustomerCache.lua";

export const DELETE_FULL_CUSTOMER_CACHE_SCRIPT = `${FULL_CUSTOMER_KEY_BUILDERS}
${deleteFullCustomerCacheScript}`;

import setFullCustomerCacheScript from "./deleteFullCustomerCache/setFullCustomerCache.lua";

export const SET_FULL_CUSTOMER_CACHE_SCRIPT = `${FULL_CUSTOMER_KEY_BUILDERS}
${setFullCustomerCacheScript}`;

// ============================================================================
// RESET CUSTOMER ENTITLEMENTS SCRIPT (deprecated — kept for backward compat)
// ============================================================================

import resetMainScript from "./resetCustomerEntitlements/resetCustomerEntitlements.lua";

/** @deprecated Use UPDATE_CUSTOMER_ENTITLEMENTS_SCRIPT instead. */
export const RESET_CUSTOMER_ENTITLEMENTS_SCRIPT = `${LUA_UTILS}
${FULL_CUSTOMER_UTILS}
${resetMainScript}`;

// ============================================================================
// UPDATE CUSTOMER ENTITLEMENTS SCRIPT (unified reset + deduction cache update)
// ============================================================================

import updateMainScript from "./updateCustomerEntitlements/updateCustomerEntitlements.lua";

export const UPDATE_CUSTOMER_ENTITLEMENTS_SCRIPT = `${LUA_UTILS}
${FULL_CUSTOMER_UTILS}
${updateMainScript}`;

// ============================================================================
// ADJUST CUSTOMER ENTITLEMENT BALANCE SCRIPT
// ============================================================================

import adjustBalanceMainScript from "./customerEntitlements/adjustCustomerEntitlementBalance.lua";

export const ADJUST_CUSTOMER_ENTITLEMENT_BALANCE_SCRIPT = `${LUA_UTILS}
${FULL_CUSTOMER_UTILS}
${adjustBalanceMainScript}`;

// ============================================================================
// CUSTOMER SCRIPTS (top-level customer fields, entities, invoices)
// ============================================================================

import updateCustomerDataMainScript from "./customers/updateCustomerData.lua";

export const UPDATE_CUSTOMER_DATA_SCRIPT = `${LUA_UTILS}
${updateCustomerDataMainScript}`;

import APPEND_ENTITY_TO_CUSTOMER_SCRIPT_RAW from "./customers/appendEntityToCustomer.lua";
export const APPEND_ENTITY_TO_CUSTOMER_SCRIPT = APPEND_ENTITY_TO_CUSTOMER_SCRIPT_RAW;

import UPDATE_ENTITY_IN_CUSTOMER_SCRIPT_RAW from "./customers/updateEntityInCustomer.lua";
export const UPDATE_ENTITY_IN_CUSTOMER_SCRIPT = UPDATE_ENTITY_IN_CUSTOMER_SCRIPT_RAW;

import UPSERT_INVOICE_IN_CUSTOMER_SCRIPT_RAW from "./customers/upsertInvoice.lua";
export const UPSERT_INVOICE_IN_CUSTOMER_SCRIPT = UPSERT_INVOICE_IN_CUSTOMER_SCRIPT_RAW;

// ============================================================================
// CUSTOMER PRODUCT SCRIPTS
// ============================================================================

import UPDATE_CUSTOMER_PRODUCT_SCRIPT_RAW from "./customerProducts/updateCustomerProduct.lua";
export const UPDATE_CUSTOMER_PRODUCT_SCRIPT = UPDATE_CUSTOMER_PRODUCT_SCRIPT_RAW;
