import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// SHARED LUA FUNCTIONS
// ============================================================================

// Load shared feature loading function (used by customer, entity, and deduction scripts)
const LOAD_CUS_FEATURES = readFileSync(
	join(__dirname, "cusLuaScripts/loadCusFeatures.lua"),
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

// Prepend loadCusFeatures to GET_CUSTOMER_SCRIPT so it can use the function
const getCustomerScript = readFileSync(
	join(__dirname, "cusLuaScripts/getCustomer.lua"),
	"utf-8",
);
export const GET_CUSTOMER_SCRIPT = `${LOAD_CUS_FEATURES}\n${getCustomerScript}`;

// Prepend validation function to SET_CUSTOMER_SCRIPT
const setCustomerScript = readFileSync(
	join(__dirname, "cusLuaScripts/setCustomer.lua"),
	"utf-8",
);
export const SET_CUSTOMER_SCRIPT = `${CHECK_CACHE_EXISTS}\n${setCustomerScript}`;

export const SET_CUSTOMER_PRODUCTS_SCRIPT = readFileSync(
	join(__dirname, "cusLuaScripts/setCustomerProducts.lua"),
	"utf-8",
);

export const SET_CUSTOMER_DETAILS_SCRIPT = readFileSync(
	join(__dirname, "cusLuaScripts/setCustomerDetails.lua"),
	"utf-8",
);

export const DELETE_CUSTOMER_SCRIPT = readFileSync(
	join(__dirname, "cusLuaScripts/deleteCustomer.lua"),
	"utf-8",
);

// ============================================================================
// ENTITY SCRIPTS
// ============================================================================

// Load shared validation function
const CHECK_ENTITY_CACHE_EXISTS = readFileSync(
	join(__dirname, "entityLuaScripts/checkEntityCacheExists.lua"),
	"utf-8",
);

// Prepend loadCusFeatures to GET_ENTITY_SCRIPT so it can use the function
const getEntityScript = readFileSync(
	join(__dirname, "entityLuaScripts/getEntity.lua"),
	"utf-8",
);
export const GET_ENTITY_SCRIPT = `${LOAD_CUS_FEATURES}\n${getEntityScript}`;

// Prepend validation function to SET_ENTITY_SCRIPT
const setEntityScript = readFileSync(
	join(__dirname, "entityLuaScripts/setEntity.lua"),
	"utf-8",
);
export const SET_ENTITY_SCRIPT = `${CHECK_ENTITY_CACHE_EXISTS}\n${setEntityScript}`;

export const SET_ENTITIES_BATCH_SCRIPT = readFileSync(
	join(__dirname, "entityLuaScripts/setEntitiesBatch.lua"),
	"utf-8",
);

export const SET_ENTITY_PRODUCTS_SCRIPT = readFileSync(
	join(__dirname, "entityLuaScripts/setEntityProducts.lua"),
	"utf-8",
);

// ============================================================================
// DEDUCTION SCRIPTS
// ============================================================================

// Load batchDeduction script
const batchDeduction = readFileSync(
	join(__dirname, "deductionLuaScripts/batchDeduction.lua"),
	"utf-8",
);

export function getBatchDeductionScript(): string {
	return `${LOAD_CUS_FEATURES}\n${batchDeduction}`;
}

export const BATCH_DEDUCTION_SCRIPT = getBatchDeductionScript();
