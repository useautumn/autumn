import { FULL_CUSTOMER_CACHE_VERSION } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/fullCustomerCacheConfig.js";

// ============================================================================
// HELPER MODULES (imported as text — works with both Bun and esbuild)
// ============================================================================

import LUA_UTILS from "./luaUtils.lua";
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
import LOCK_UNWIND_UTILS_V2 from "./fullSubjectDeduction/lock/unwindLockV2.lua";

// ============================================================================
// FULL SUBJECT HELPERS (V2 cache scripts)
// ============================================================================

import setCachedFullSubjectScript from "./fullSubject/setCachedFullSubject.lua";
import updateCustomerDataV2Script from "./fullSubject/updateCustomerDataV2.lua";
import updateEntityDataV2Script from "./fullSubject/updateEntityDataV2.lua";
import updateCachedInvoiceV2Script from "./fullSubject/updateCachedInvoice.lua";
import updateCustomerProductOptionsScript from "./fullSubject/updateCustomerProduct/updateCustomerProductOptions.lua";
import updateCustomerProductV2MainScript from "./fullSubject/updateCustomerProduct/updateCustomerProductV2.lua";
import adjustSubjectBalanceMainScript from "./fullSubject/adjustSubjectBalance.lua";

// ============================================================================
// FULL SUBJECT DEDUCTION HELPERS (V2 cache — per-feature hash balances)
// ============================================================================

import READ_SUBJECT_BALANCES from "./fullSubjectDeduction/readSubjectBalances.lua";
import CONTEXT_UTILS_V2 from "./fullSubjectDeduction/contextUtilsV2.lua";
import DEDUCT_FROM_ROLLOVERS_V2 from "./fullSubjectDeduction/deductFromRolloversV2.lua";
import DEDUCT_FROM_MAIN_BALANCE_V2 from "./fullSubjectDeduction/deductFromMainBalanceV2.lua";
import RUN_DEDUCTION_ON_CONTEXT_V2 from "./fullSubjectDeduction/runDeductionOnContextV2.lua";
import SPEND_LIMIT_UTILS_V2 from "./fullSubjectDeduction/spendLimitUtilsV2.lua";
import UPDATE_AGGREGATED_BALANCES from "./fullSubjectDeduction/updateAggregatedBalances.lua";
import DEDUCT_FROM_SUBJECT_BALANCES_MAIN from "./fullSubjectDeduction/deductFromSubjectBalances.lua";

// ============================================================================
// UPDATE SUBJECT BALANCES HELPERS (V2 cache — per-feature hash updates)
// ============================================================================

import UPDATE_CONTEXT_UTILS from "./fullSubject/updateSubjectBalances/updateContextUtils.lua";
import APPLY_FIELD_UPDATES from "./fullSubject/updateSubjectBalances/applyFieldUpdates.lua";
import UPDATE_SUBJECT_BALANCES_MAIN from "./fullSubject/updateSubjectBalances/updateSubjectBalances.lua";

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

/** Atomically set a FullSubject cache: subject view + all balance hashes. */
export const SET_CACHED_FULL_SUBJECT_SCRIPT = setCachedFullSubjectScript;

/** Atomically update top-level customer fields in the cached FullSubject. */
export const UPDATE_CUSTOMER_DATA_V2_SCRIPT = updateCustomerDataV2Script;

/** Atomically update top-level entity fields in the cached FullSubject. */
export const UPDATE_ENTITY_DATA_V2_SCRIPT = updateEntityDataV2Script;

/** Atomically upsert an invoice in the cached FullSubject invoices array. */
export const UPDATE_CACHED_INVOICE_V2_SCRIPT = updateCachedInvoiceV2Script;

/** Atomically update customer product fields in the cached FullSubject. */
export const UPDATE_CUSTOMER_PRODUCT_V2_SCRIPT = `${updateCustomerProductOptionsScript}
${updateCustomerProductV2MainScript}`;

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

// ============================================================================
// FULL SUBJECT DEDUCTION SCRIPT (V2 cache — per-feature hash balances)
// ============================================================================

/**
 * Lua script for deducting from subject balances in Redis (V2 cache).
 * Reads from per-feature hash fields and writes back touched entitlements.
 * Composed from shared helper modules + V2-specific storage adapters.
 */
export const DEDUCT_FROM_SUBJECT_BALANCES_SCRIPT = `${LUA_UTILS}
${READ_SUBJECT_BALANCES}
${CONTEXT_UTILS_V2}
${GET_TOTAL_BALANCE}
${DEDUCT_FROM_ROLLOVERS_V2}
${DEDUCT_FROM_MAIN_BALANCE_V2}
${SPEND_LIMIT_UTILS_V2}
${RUN_DEDUCTION_ON_CONTEXT_V2}
${MUTATION_ITEM_UTILS}
${LOCK_RECEIPT_UTILS}
${LOCK_STATE_UTILS}
${LOCK_UNWIND_UTILS_V2}
${UPDATE_AGGREGATED_BALANCES}
${DEDUCT_FROM_SUBJECT_BALANCES_MAIN}`;

// ============================================================================
// UPDATE SUBJECT BALANCES SCRIPT (V2 cache — per-feature hash updates)
// ============================================================================

/**
 * Lua script for atomically adjusting one SubjectBalance.balance entry in a
 * per-feature hash. Emits entity-level mutation logs so aggregated balances
 * stay in sync.
 */
export const ADJUST_SUBJECT_BALANCE_SCRIPT = `${LUA_UTILS}
${UPDATE_CONTEXT_UTILS}
${UPDATE_AGGREGATED_BALANCES}
${adjustSubjectBalanceMainScript}`;

/**
 * Lua script for atomically updating SubjectBalance entries in a single
 * per-feature balance hash. Supports scalar updates, rollover ops,
 * replaceable ops, expected_next_reset_at guard, and entity-level
 * aggregated balance propagation.
 * Called once per feature via pipeline.
 */
export const UPDATE_SUBJECT_BALANCES_SCRIPT = `${LUA_UTILS}
${UPDATE_CONTEXT_UTILS}
${APPLY_FIELD_UPDATES}
${UPDATE_AGGREGATED_BALANCES}
${UPDATE_SUBJECT_BALANCES_MAIN}`;
