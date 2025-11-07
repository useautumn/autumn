import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load shared validation function
const CHECK_CACHE_EXISTS = readFileSync(
	join(__dirname, "checkCacheExists.lua"),
	"utf-8",
);

// Load shared feature loading function
const LOAD_CUS_FEATURES = readFileSync(
	join(__dirname, "loadCusFeatures.lua"),
	"utf-8",
);

// Load Lua scripts at module initialization
// Prepend loadCusFeatures to GET_CUSTOMER_SCRIPT so it can use the function
const getCustomerScript = readFileSync(
	join(__dirname, "getCustomer.lua"),
	"utf-8",
);
export const GET_CUSTOMER_SCRIPT = `${LOAD_CUS_FEATURES}\n${getCustomerScript}`;

// Prepend validation function to SET_CUSTOMER_SCRIPT
const setCustomerScript = readFileSync(
	join(__dirname, "setCustomer.lua"),
	"utf-8",
);
export const SET_CUSTOMER_SCRIPT = `${CHECK_CACHE_EXISTS}\n${setCustomerScript}`;

export const SET_CUSTOMER_PRODUCTS_SCRIPT = readFileSync(
	join(__dirname, "setCustomerProducts.lua"),
	"utf-8",
);

export const SET_CUSTOMER_DETAILS_SCRIPT = readFileSync(
	join(__dirname, "setCustomerDetails.lua"),
	"utf-8",
);
