import { ApiVersion } from "@autumn/shared";
import { AutumnInt } from "../../src/external/autumn/autumnCli.js";

const autumn = new AutumnInt({ version: ApiVersion.V2_3 });
const customerId = "props-demo";

const TOTAL_EVENTS = 1060;
const ATTR_KEYS = Array.from({ length: 120 }, (_, i) => `attr_${String(i).padStart(3, "0")}`);
const MODELS = ["gpt-4o", "claude-sonnet-4", "gemini-pro"];
const ENVIRONMENTS = ["production", "staging"];
const CHUNK = 25;

let sent = 0;
let failed = 0;
for (let start = 0; start < TOTAL_EVENTS; start += CHUNK) {
	const batch = Array.from(
		{ length: Math.min(CHUNK, TOTAL_EVENTS - start) },
		(_, offset) => {
			const i = start + offset;
			return autumn
				.track({
					customer_id: customerId,
					feature_id: "messages",
					value: 1,
					properties: {
						apiKeyId: `sk_live_${String(i).padStart(4, "0")}`,
						model: MODELS[i % MODELS.length],
						environment: ENVIRONMENTS[i % ENVIRONMENTS.length],
						[ATTR_KEYS[i % ATTR_KEYS.length]]: `value_${i % 7}`,
						[ATTR_KEYS[(i * 7 + 3) % ATTR_KEYS.length]]: `value_${i % 5}`,
					},
				})
				.then(() => {
					sent++;
				})
				.catch(() => {
					failed++;
				});
		},
	);
	await Promise.all(batch);
	if (start % 250 === 0) console.log(`progress: ${sent} sent, ${failed} failed`);
}

console.log(`done: ${sent} sent, ${failed} failed`);
console.log(
	`distinct apiKeyIds: ${TOTAL_EVENTS}, distinct property keys: ${ATTR_KEYS.length + 3}`,
);
