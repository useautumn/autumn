import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load shared loadCusFeatures function from customer utils
const loadCusFeatures = readFileSync(
	join(
		__dirname,
		"../../../customers/cusUtils/apiCusCacheUtils/cusLuaScripts/loadCusFeatures.lua",
	),
	"utf-8",
);

// Load batchDeduction script
const batchDeduction = readFileSync(
	join(__dirname, "batchDeduction.lua"),
	"utf-8",
);

export function getBatchDeductionScript(): string {
	return `${loadCusFeatures}\n${batchDeduction}`;
}

export const BATCH_DEDUCTION_SCRIPT = getBatchDeductionScript();
