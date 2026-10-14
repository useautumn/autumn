import type { Logger } from "../src/external/logtail/logtailUtils";
import { refreshCeBalancesCache } from "../src/external/motherduck/refreshCeBalancesCache";

const consoleLogger = {
	info: (...args: unknown[]) => console.log("[info]", ...args),
	warn: (...args: unknown[]) => console.warn("[warn]", ...args),
	error: (...args: unknown[]) => console.error("[error]", ...args),
	debug: (...args: unknown[]) => console.log("[debug]", ...args),
	trace: (...args: unknown[]) => console.log("[trace]", ...args),
} as unknown as Logger;

console.log("Starting cache refresh...");
const startedAt = performance.now();
await refreshCeBalancesCache({ logger: consoleLogger });
console.log(
	`Done in ${((performance.now() - startedAt) / 1000).toFixed(1)}s`,
);
process.exit(0);
