import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load shared validation function
const CHECK_ENTITY_CACHE_EXISTS = readFileSync(
	join(__dirname, "checkEntityCacheExists.lua"),
	"utf-8",
);

// Load Lua scripts at module initialization
export const GET_ENTITY_SCRIPT = readFileSync(
	join(__dirname, "getEntity.lua"),
	"utf-8",
);

// Prepend validation function to SET_ENTITY_SCRIPT
const setEntityScript = readFileSync(join(__dirname, "setEntity.lua"), "utf-8");
export const SET_ENTITY_SCRIPT = `${CHECK_ENTITY_CACHE_EXISTS}\n${setEntityScript}`;

export const SET_ENTITIES_BATCH_SCRIPT = readFileSync(
	join(__dirname, "setEntitiesBatch.lua"),
	"utf-8",
);

export const SET_ENTITY_PRODUCTS_SCRIPT = readFileSync(
	join(__dirname, "setEntityProducts.lua"),
	"utf-8",
);
