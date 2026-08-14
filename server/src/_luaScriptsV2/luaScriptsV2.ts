// ============================================================================
// HELPER MODULES (imported as text — works with both Bun and esbuild)
// ============================================================================

import GET_TOTAL_BALANCE from "./deductFromCustomerEntitlements/getTotalBalance.lua";
import MUTATION_ITEM_UTILS from "./deduction/mutationItemUtils.lua";
import LOCK_RECEIPT_UTILS_V2 from "./fullSubjectDeduction/lock/lockReceiptV2.lua";
import LOCK_UNWIND_UTILS_V2 from "./fullSubjectDeduction/lock/unwindLockV2.lua";
import LUA_UTILS from "./luaUtils.lua";

// ============================================================================
// FULL SUBJECT HELPERS (V2 cache scripts)
// ============================================================================

import adjustSubjectBalanceMainScript from "./fullSubject/adjustSubjectBalance.lua";
import getDelSharedBalanceFieldsScript from "./fullSubject/getDelSharedBalanceFields.lua";
import setCachedFullSubjectScript from "./fullSubject/setCachedFullSubject.lua";
import updateCachedInvoiceV2Script from "./fullSubject/updateCachedInvoice.lua";
import updateCustomerDataV2Script from "./fullSubject/updateCustomerDataV2.lua";
import updateCustomerProductOptionsScript from "./fullSubject/updateCustomerProduct/updateCustomerProductOptions.lua";
import updateCustomerProductV2MainScript from "./fullSubject/updateCustomerProduct/updateCustomerProductV2.lua";
import updateEntityDataV2Script from "./fullSubject/updateEntityDataV2.lua";

// ============================================================================
// FULL SUBJECT DEDUCTION HELPERS (V2 cache — per-feature hash balances)
// ============================================================================

import CONTEXT_UTILS_V2 from "./fullSubjectDeduction/contextUtilsV2.lua";
import DEDUCT_FROM_MAIN_BALANCE_V2 from "./fullSubjectDeduction/deductFromMainBalanceV2.lua";
import DEDUCT_FROM_ROLLOVERS_V2 from "./fullSubjectDeduction/deductFromRolloversV2.lua";
import DEDUCT_FROM_SUBJECT_BALANCES_MAIN from "./fullSubjectDeduction/deductFromSubjectBalances.lua";
import READ_SUBJECT_BALANCES from "./fullSubjectDeduction/readSubjectBalances.lua";
import RUN_DEDUCTION_ON_CONTEXT_V2 from "./fullSubjectDeduction/runDeductionOnContextV2.lua";
import SPEND_LIMIT_UTILS_V2 from "./fullSubjectDeduction/spendLimitUtilsV2.lua";
import UPDATE_AGGREGATED_BALANCES from "./fullSubjectDeduction/updateAggregatedBalances.lua";
import READ_USAGE_WINDOWS from "./fullSubjectDeduction/usageWindows/readUsageWindows.lua";
import USAGE_WINDOW_CONTEXT_UTILS_V2 from "./fullSubjectDeduction/usageWindows/usageWindowContextUtilsV2.lua";

// ============================================================================
// UPDATE SUBJECT BALANCES HELPERS (V2 cache — per-feature hash updates)
// ============================================================================

import ROLL_USAGE_WINDOWS_MAIN from "./fullSubject/rollUsageWindows/rollUsageWindows.lua";
import APPLY_FIELD_UPDATES from "./fullSubject/updateSubjectBalances/applyFieldUpdates.lua";
import UPDATE_CONTEXT_UTILS from "./fullSubject/updateSubjectBalances/updateContextUtils.lua";
import UPDATE_SUBJECT_BALANCES_MAIN from "./fullSubject/updateSubjectBalances/updateSubjectBalances.lua";

/** Atomically set a FullSubject cache: subject view + all balance hashes. */
export const SET_CACHED_FULL_SUBJECT_SCRIPT = `${setCachedFullSubjectScript}`;

/** Atomically update top-level customer fields in the cached FullSubject. */
export const UPDATE_CUSTOMER_DATA_V2_SCRIPT = `${updateCustomerDataV2Script}`;

/** Atomically read + delete shared balance hash fields (GETDEL semantics). */
export const GETDEL_SHARED_BALANCE_FIELDS_SCRIPT = `${getDelSharedBalanceFieldsScript}`;

/** Atomically update top-level entity fields in the cached FullSubject. */
export const UPDATE_ENTITY_DATA_V2_SCRIPT = `${updateEntityDataV2Script}`;

/** Atomically upsert an invoice in the cached FullSubject invoices array. */
export const UPDATE_CACHED_INVOICE_V2_SCRIPT = `${updateCachedInvoiceV2Script}`;

/** Atomically update customer product fields in the cached FullSubject. */
export const UPDATE_CUSTOMER_PRODUCT_V2_SCRIPT = `${updateCustomerProductOptionsScript}
${updateCustomerProductV2MainScript}`;

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
${READ_USAGE_WINDOWS}
${CONTEXT_UTILS_V2}
${GET_TOTAL_BALANCE}
${DEDUCT_FROM_ROLLOVERS_V2}
${DEDUCT_FROM_MAIN_BALANCE_V2}
${SPEND_LIMIT_UTILS_V2}
${USAGE_WINDOW_CONTEXT_UTILS_V2}
${RUN_DEDUCTION_ON_CONTEXT_V2}
${MUTATION_ITEM_UTILS}
${LOCK_RECEIPT_UTILS_V2}
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

/**
 * Lua script for atomically rolling usage-window counters in a per-feature
 * balance hash's '_usage_windows' field (zero expired counts, advance
 * bounds/anchor). Called once per feature via pipeline by the lazy roll.
 */
export const ROLL_USAGE_WINDOWS_SCRIPT = `${LUA_UTILS}
${ROLL_USAGE_WINDOWS_MAIN}`;
