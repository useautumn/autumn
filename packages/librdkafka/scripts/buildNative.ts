import { ensureNativeBinding } from "../src/native/ensureNativeBinding.js";

const startedAt = performance.now();
const outcome = await ensureNativeBinding();
const seconds = ((performance.now() - startedAt) / 1000).toFixed(1);
console.log(`[librdkafka] native addon ${outcome} in ${seconds}s`);
