import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load Lua scripts at module initialization
export const GET_CUSTOMER_SCRIPT = readFileSync(
	join(__dirname, "getCustomer.lua"),
	"utf-8",
);

export const SET_CUSTOMER_SCRIPT = readFileSync(
	join(__dirname, "setCustomer.lua"),
	"utf-8",
);

export const BATCH_DEDUCTION_SCRIPT = readFileSync(
	join(__dirname, "batchDeduction.lua"),
	"utf-8",
);
