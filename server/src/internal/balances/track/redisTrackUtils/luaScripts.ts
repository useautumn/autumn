import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const scriptPath = join(__dirname, "batchDeduction.lua");
const isDev = process.env.NODE_ENV !== "production";

// Cache script in production for performance
let cachedScript: string | null = null;

if (!isDev) {
	cachedScript = readFileSync(scriptPath, "utf-8");
}

// Function that hot reloads in dev, uses cache in prod
export function getBatchDeductionScript(): string {
	if (isDev) {
		// Hot reload: read file every time in development
		return readFileSync(scriptPath, "utf-8");
	}
	return cachedScript!;
}

// For backward compatibility, also export as constant
// (though it won't hot reload, consumers should use the function)
export const BATCH_DEDUCTION_SCRIPT = getBatchDeductionScript();
