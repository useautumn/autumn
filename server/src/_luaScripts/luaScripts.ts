import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CACHE_CUSTOMER_VERSION, CACHE_TTL_SECONDS } from "./cacheConfig.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// SHARED LUA FUNCTIONS
// ============================================================================

// Load cache key utilities and inject version constants
const CACHE_KEY_UTILS_RAW = readFileSync(
	join(__dirname, "luaUtils/cacheKeyUtils.lua"),
	"utf-8",
);

// Inject cache version and TTL constants into cache key utils
const CACHE_KEY_UTILS = CACHE_KEY_UTILS_RAW.replace(
	/{CUSTOMER_VERSION}/g,
	CACHE_CUSTOMER_VERSION,
).replace("{TTL_SECONDS}", CACHE_TTL_SECONDS.toString());

// Load balance storage utilities
const CACHE_BALANCE_UTILS = readFileSync(
	join(__dirname, "luaUtils/storeBalances.lua"),
	"utf-8",
);

// Load shared balance loading function (used by customer, entity, and deduction scripts)
const LOAD_BALANCES = readFileSync(
	join(__dirname, "luaUtils/loadBalances.lua"),
	"utf-8",
);

// Load shared subscription utilities (used by customer and entity scripts)
const SUBSCRIPTION_UTILS = readFileSync(
	join(__dirname, "luaUtils/apiSubscriptionUtils.lua"),
	"utf-8",
);

// Load shared customer/entity getter utilities
const GET_CUSTOMER_ENTITY_UTILS = readFileSync(
	join(__dirname, "luaUtils/getCustomerEntityUtils.lua"),
	"utf-8",
);

// ============================================================================
// CUSTOMER SCRIPTS
// ============================================================================

// Load shared validation function
const CHECK_CACHE_EXISTS = readFileSync(
	join(__dirname, "cusLuaScripts/checkCacheExists.lua"),
	"utf-8",
);

// Prepend cache key utils, loadBalances, subscription utils, and getter utils to GET_CUSTOMER_SCRIPT
const getCustomerScript = readFileSync(
	join(__dirname, "cusLuaScripts/getCustomer.lua"),
	"utf-8",
);
export const GET_CUSTOMER_SCRIPT = `${CACHE_KEY_UTILS}\n${LOAD_BALANCES}\n${SUBSCRIPTION_UTILS}\n${GET_CUSTOMER_ENTITY_UTILS}\n${getCustomerScript}`;

// Prepend cache key utils and validation function to SET_CUSTOMER_SCRIPT
const setCustomerScript = readFileSync(
	join(__dirname, "cusLuaScripts/setCustomer.lua"),
	"utf-8",
);
export const SET_CUSTOMER_SCRIPT = `${CACHE_KEY_UTILS}\n${CACHE_BALANCE_UTILS}\n${CHECK_CACHE_EXISTS}\n${setCustomerScript}`;

// Prepend cache key utils to SET_CUSTOMER_PRODUCTS_SCRIPT
const setCustomerProductsScript = readFileSync(
	join(__dirname, "cusLuaScripts/setCustomerProducts.lua"),
	"utf-8",
);
export const SET_CUSTOMER_PRODUCTS_SCRIPT = `${CACHE_KEY_UTILS}\n${setCustomerProductsScript}`;

// Prepend cache key utils to SET_CUSTOMER_DETAILS_SCRIPT
const setCustomerDetailsScript = readFileSync(
	join(__dirname, "cusLuaScripts/setCustomerDetails.lua"),
	"utf-8",
);
export const SET_CUSTOMER_DETAILS_SCRIPT = `${CACHE_KEY_UTILS}\n${setCustomerDetailsScript}`;

// Prepend cache key utils to DELETE_CUSTOMER_SCRIPT
const deleteCustomerScript = readFileSync(
	join(__dirname, "cusLuaScripts/deleteCustomer.lua"),
	"utf-8",
);
export const DELETE_CUSTOMER_SCRIPT = `${CACHE_KEY_UTILS}\n${deleteCustomerScript}`;

// ============================================================================
// ENTITY SCRIPTS
// ============================================================================

// Load shared validation function
const CHECK_ENTITY_CACHE_EXISTS = readFileSync(
	join(__dirname, "entityLuaScripts/checkEntityCacheExists.lua"),
	"utf-8",
);

// Prepend cache key utils, loadBalances, subscription utils, and getter utils to GET_ENTITY_SCRIPT
const getEntityScript = readFileSync(
	join(__dirname, "entityLuaScripts/getEntity.lua"),
	"utf-8",
);
export const GET_ENTITY_SCRIPT = `${CACHE_KEY_UTILS}\n${LOAD_BALANCES}\n${SUBSCRIPTION_UTILS}\n${GET_CUSTOMER_ENTITY_UTILS}\n${getEntityScript}`;

// Prepend cache key utils and validation function to SET_ENTITY_SCRIPT
const setEntityScript = readFileSync(
	join(__dirname, "entityLuaScripts/setEntity.lua"),
	"utf-8",
);
export const SET_ENTITY_SCRIPT = `${CACHE_KEY_UTILS}\n${CACHE_BALANCE_UTILS}\n${CHECK_ENTITY_CACHE_EXISTS}\n${setEntityScript}`;

// Prepend cache key utils and balance utils to SET_ENTITIES_BATCH_SCRIPT
const setEntitiesBatchScript = readFileSync(
	join(__dirname, "entityLuaScripts/setEntitiesBatch.lua"),
	"utf-8",
);
export const SET_ENTITIES_BATCH_SCRIPT = `${CACHE_KEY_UTILS}\n${CACHE_BALANCE_UTILS}\n${setEntitiesBatchScript}`;

// Prepend cache key utils to SET_ENTITY_PRODUCTS_SCRIPT
const setEntityProductsScript = readFileSync(
	join(__dirname, "entityLuaScripts/setEntityProducts.lua"),
	"utf-8",
);
export const SET_ENTITY_PRODUCTS_SCRIPT = `${CACHE_KEY_UTILS}\n${setEntityProductsScript}`;

// ============================================================================
// DEDUCTION SCRIPTS
// ============================================================================

// Load batchDeduction script
const batchDeduction = readFileSync(
	join(__dirname, "deductionLuaScripts/batchDeduction.lua"),
	"utf-8",
);

export function getBatchDeductionScript(): string {
	return `${CACHE_KEY_UTILS}\n${LOAD_BALANCES}\n${SUBSCRIPTION_UTILS}\n${GET_CUSTOMER_ENTITY_UTILS}\n${batchDeduction}`;
}

export const BATCH_DEDUCTION_SCRIPT = getBatchDeductionScript();
