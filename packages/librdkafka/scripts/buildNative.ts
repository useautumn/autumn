import { ensureNativeBinding } from "../src/native/ensureNativeBinding.js";

const prebuiltOnly = process.argv.includes("--prebuilt-only");
const startedAt = performance.now();
const outcome = await ensureNativeBinding({ compileOnMiss: !prebuiltOnly });
const seconds = ((performance.now() - startedAt) / 1000).toFixed(1);
if (outcome === "missing") {
	console.error(
		"[librdkafka] no prebuilt addon for this machine. Compile it once (~15 min): bun run --cwd packages/librdkafka build",
	);
	process.exit(1);
}
console.log(`[librdkafka] native addon ${outcome} in ${seconds}s`);
