import {
	CACHE_CUSTOMER_VERSION,
	CACHE_GUARD_TTL_MS,
	CACHE_TTL_SECONDS,
} from "./cacheConfig.js";

// ============================================================================
// SHARED LUA FUNCTIONS (imported as text — works with both Bun and esbuild)
// ============================================================================

import CACHE_KEY_UTILS_RAW from "./luaUtils/cacheKeyUtils.lua";
import CACHE_BALANCE_UTILS from "./luaUtils/storeBalances.lua";
import LOAD_BALANCES from "./luaUtils/loadBalances.lua";
import FILTER_BALANCE_UTILS from "./luaUtils/filterBalanceUtils.lua";
import ACCUMULATOR_UTILS from "./luaUtils/accumulatorUtils.lua";
import SUBSCRIPTION_UTILS from "./luaUtils/apiSubscriptionUtils.lua";
import GET_CUSTOMER_ENTITY_UTILS from "./luaUtils/getCustomerEntityUtils.lua";

const CACHE_KEY_UTILS = CACHE_KEY_UTILS_RAW.replace(
	"{CUSTOMER_VERSION}",
	CACHE_CUSTOMER_VERSION,
)
	.replace("{TTL_SECONDS}", CACHE_TTL_SECONDS.toString())
	.replace("{GUARD_TTL_MS}", CACHE_GUARD_TTL_MS.toString());

// ============================================================================
// CUSTOMER SCRIPTS
// ============================================================================

import CHECK_CACHE_EXISTS from "./cusLuaScripts/checkCacheExists.lua";
import getCustomerScript from "./cusLuaScripts/getCustomer.lua";
import setCustomerScript from "./cusLuaScripts/setCustomer.lua";
import setSubscriptionsScript from "./cusLuaScripts/setSubscriptions.lua";
import setCustomerDetailsScript from "./cusLuaScripts/setCustomerDetails.lua";
import setInvoicesScript from "./cusLuaScripts/setInvoices.lua";
import setGrantedBalanceScript from "./cusLuaScripts/setGrantedBalance.lua";
import deleteCustomerScript from "./cusLuaScripts/deleteCustomer.lua";
import batchDeleteCustomersScript from "./cusLuaScripts/batchDeleteCustomers.lua";

export const GET_CUSTOMER_SCRIPT = `${CACHE_KEY_UTILS}\n${LOAD_BALANCES}\n${SUBSCRIPTION_UTILS}\n${GET_CUSTOMER_ENTITY_UTILS}\n${getCustomerScript}`;
export const SET_CUSTOMER_SCRIPT = `${CACHE_KEY_UTILS}\n${CACHE_BALANCE_UTILS}\n${CHECK_CACHE_EXISTS}\n${setCustomerScript}`;
export const SET_SUBSCRIPTIONS_SCRIPT = `${CACHE_KEY_UTILS}\n${setSubscriptionsScript}`;
export const SET_CUSTOMER_DETAILS_SCRIPT = `${CACHE_KEY_UTILS}\n${setCustomerDetailsScript}`;
export const SET_INVOICES_SCRIPT = `${CACHE_KEY_UTILS}\n${setInvoicesScript}`;
export const SET_GRANTED_BALANCE_SCRIPT = `${CACHE_KEY_UTILS}\n${setGrantedBalanceScript}`;
export const DELETE_CUSTOMER_SCRIPT = `${CACHE_KEY_UTILS}\n${deleteCustomerScript}`;
export const BATCH_DELETE_CUSTOMERS_SCRIPT = `${CACHE_KEY_UTILS}\n${batchDeleteCustomersScript}`;

// ============================================================================
// ENTITY SCRIPTS
// ============================================================================

import CHECK_ENTITY_CACHE_EXISTS from "./entityLuaScripts/checkEntityCacheExists.lua";
import getEntityScript from "./entityLuaScripts/getEntity.lua";
import setEntityScript from "./entityLuaScripts/setEntity.lua";
import setEntitiesBatchScript from "./entityLuaScripts/setEntitiesBatch.lua";
import setEntityProductsScript from "./entityLuaScripts/setEntityProducts.lua";

export const GET_ENTITY_SCRIPT = `${CACHE_KEY_UTILS}\n${LOAD_BALANCES}\n${SUBSCRIPTION_UTILS}\n${GET_CUSTOMER_ENTITY_UTILS}\n${getEntityScript}`;
const SET_ENTITY_SCRIPT = `${CACHE_KEY_UTILS}\n${CACHE_BALANCE_UTILS}\n${CHECK_ENTITY_CACHE_EXISTS}\n${setEntityScript}`;
export const SET_ENTITIES_BATCH_SCRIPT = `${CACHE_KEY_UTILS}\n${CACHE_BALANCE_UTILS}\n${setEntitiesBatchScript}`;
export const SET_ENTITY_PRODUCTS_SCRIPT = `${CACHE_KEY_UTILS}\n${setEntityProductsScript}`;

// ============================================================================
// DEDUCTION SCRIPTS
// ============================================================================

import batchDeduction from "./deductionLuaScripts/batchDeduction.lua";

export function getBatchDeductionScript(): string {
	return `${CACHE_KEY_UTILS}\n${LOAD_BALANCES}\n${FILTER_BALANCE_UTILS}\n${ACCUMULATOR_UTILS}\n${SUBSCRIPTION_UTILS}\n${GET_CUSTOMER_ENTITY_UTILS}\n${batchDeduction}`;
}

const BATCH_DEDUCTION_SCRIPT = getBatchDeductionScript();
