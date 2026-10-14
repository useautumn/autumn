import { USAGE_WINDOW_BOUND_TOLERANCE_MS } from "@autumn/shared";

import GET_TOTAL_BALANCE from "./deductFromCustomerEntitlements/getTotalBalance.lua";
import MUTATION_ITEM_UTILS from "./deduction/mutationItemUtils.lua";
import LOCK_RECEIPT_UTILS_V2 from "./fullSubjectDeduction/lock/lockReceiptV2.lua";
import LOCK_UNWIND_UTILS_V2 from "./fullSubjectDeduction/lock/unwindLockV2.lua";
import LUA_UTILS from "./luaUtils.lua";

import adjustSubjectBalanceMainScript from "./fullSubject/adjustSubjectBalance.lua";
import getDelSharedBalanceFieldsScript from "./fullSubject/getDelSharedBalanceFields.lua";
import publishCachedFullSubjectScript from "./fullSubject/publishCachedFullSubject.lua";
import setCachedFullSubjectScript from "./fullSubject/setCachedFullSubject.lua";
import updateCachedInvoiceV2Script from "./fullSubject/updateCachedInvoice.lua";
import updateCustomerDataV2Script from "./fullSubject/updateCustomerDataV2.lua";
import updateCustomerProductOptionsScript from "./fullSubject/updateCustomerProduct/updateCustomerProductOptions.lua";
import updateCustomerProductV2MainScript from "./fullSubject/updateCustomerProduct/updateCustomerProductV2.lua";
import updateEntityDataV2Script from "./fullSubject/updateEntityDataV2.lua";

import ALLOCATION_GATE_V2 from "./fullSubjectDeduction/allocations/allocationGateV2.lua";
import CONTEXT_UTILS_V2 from "./fullSubjectDeduction/contextUtilsV2.lua";
import CREDIT_RATE_UTILS from "./fullSubjectDeduction/creditRateUtils.lua";
import DEDUCT_FROM_MAIN_BALANCE_V2 from "./fullSubjectDeduction/deductFromMainBalanceV2.lua";
import DEDUCT_FROM_ROLLOVERS_V2 from "./fullSubjectDeduction/deductFromRolloversV2.lua";
import DEDUCT_FROM_SUBJECT_BALANCES_MAIN from "./fullSubjectDeduction/deductFromSubjectBalances.lua";
import READ_SUBJECT_BALANCES from "./fullSubjectDeduction/readSubjectBalances.lua";
import RUN_DEDUCTION_ON_CONTEXT_V2 from "./fullSubjectDeduction/runDeductionOnContextV2.lua";
import SPEND_LIMIT_UTILS_V2 from "./fullSubjectDeduction/spendLimitUtilsV2.lua";
import UPDATE_AGGREGATED_BALANCES from "./fullSubjectDeduction/updateAggregatedBalances.lua";
import READ_USAGE_WINDOWS from "./fullSubjectDeduction/usageWindows/readUsageWindows.lua";
import USAGE_WINDOW_CONTEXT_UTILS_V2 from "./fullSubjectDeduction/usageWindows/usageWindowContextUtilsV2.lua";

import PATCH_ALLOCATION_COUNTER_MAIN from "./fullSubject/patchAllocationCounter/patchAllocationCounter.lua";
import ROLL_USAGE_WINDOWS_MAIN from "./fullSubject/rollUsageWindows/rollUsageWindows.lua";
import APPLY_FIELD_UPDATES from "./fullSubject/updateSubjectBalances/applyFieldUpdates.lua";
import UPDATE_CONTEXT_UTILS from "./fullSubject/updateSubjectBalances/updateContextUtils.lua";
import UPDATE_SUBJECT_BALANCES_MAIN from "./fullSubject/updateSubjectBalances/updateSubjectBalances.lua";

export const SET_CACHED_FULL_SUBJECT_SCRIPT = `${setCachedFullSubjectScript}`;

export const PUBLISH_CACHED_FULL_SUBJECT_SCRIPT = `${publishCachedFullSubjectScript}`;

export const UPDATE_CUSTOMER_DATA_V2_SCRIPT = `${updateCustomerDataV2Script}`;

export const GETDEL_SHARED_BALANCE_FIELDS_SCRIPT = `${getDelSharedBalanceFieldsScript}`;

export const UPDATE_ENTITY_DATA_V2_SCRIPT = `${updateEntityDataV2Script}`;

export const UPDATE_CACHED_INVOICE_V2_SCRIPT = `${updateCachedInvoiceV2Script}`;

export const UPDATE_CUSTOMER_PRODUCT_V2_SCRIPT = `${updateCustomerProductOptionsScript}
${updateCustomerProductV2MainScript}`;

export const DEDUCT_FROM_SUBJECT_BALANCES_SCRIPT = `${LUA_UTILS}
${CREDIT_RATE_UTILS}
${READ_SUBJECT_BALANCES}
local USAGE_WINDOW_BOUND_TOLERANCE_MS = ${USAGE_WINDOW_BOUND_TOLERANCE_MS}
${READ_USAGE_WINDOWS}
${CONTEXT_UTILS_V2}
${GET_TOTAL_BALANCE}
${DEDUCT_FROM_ROLLOVERS_V2}
${DEDUCT_FROM_MAIN_BALANCE_V2}
${SPEND_LIMIT_UTILS_V2}
${USAGE_WINDOW_CONTEXT_UTILS_V2}
${ALLOCATION_GATE_V2}
${RUN_DEDUCTION_ON_CONTEXT_V2}
${MUTATION_ITEM_UTILS}
${LOCK_RECEIPT_UTILS_V2}
${LOCK_UNWIND_UTILS_V2}
${UPDATE_AGGREGATED_BALANCES}
${DEDUCT_FROM_SUBJECT_BALANCES_MAIN}`;

export const ADJUST_SUBJECT_BALANCE_SCRIPT = `${LUA_UTILS}
${UPDATE_CONTEXT_UTILS}
${UPDATE_AGGREGATED_BALANCES}
${adjustSubjectBalanceMainScript}`;

export const UPDATE_SUBJECT_BALANCES_SCRIPT = `${LUA_UTILS}
${UPDATE_CONTEXT_UTILS}
${APPLY_FIELD_UPDATES}
${UPDATE_AGGREGATED_BALANCES}
${UPDATE_SUBJECT_BALANCES_MAIN}`;

export const ROLL_USAGE_WINDOWS_SCRIPT = `${LUA_UTILS}
${ROLL_USAGE_WINDOWS_MAIN}`;

export const PATCH_ALLOCATION_COUNTER_SCRIPT = `${LUA_UTILS}
local USAGE_WINDOW_BOUND_TOLERANCE_MS = ${USAGE_WINDOW_BOUND_TOLERANCE_MS}
${PATCH_ALLOCATION_COUNTER_MAIN}`;
