import { ApiVersion } from "@autumn/shared";
import { AutumnInt } from "../../src/external/autumn/autumnCli.js";

const autumn = new AutumnInt({ version: ApiVersion.V2_3 });
const customerId = "props-demo";

const created = await autumn
	.createCustomer({
		id: customerId,
		email: "props-demo@example.com",
		name: "Props Demo",
	})
	.then(() => "created")
	.catch((error: Error) => `create skipped: ${error.message}`);
console.log(created);

const API_KEYS = ["sk_live_alpha", "sk_live_beta", "sk_test_gamma"];
const MODELS = ["gpt-4o", "claude-sonnet-4"];
const ENVIRONMENTS = ["production", "staging"];
const REGIONS = ["us-east-1", "eu-west-2"];
const FEATURES = ["messages", "test"];

let sent = 0;
let feature = FEATURES[0];
for (let i = 0; i < 24; i++) {
	const properties = {
		apiKeyId: API_KEYS[i % API_KEYS.length],
		model: MODELS[i % MODELS.length],
		environment: ENVIRONMENTS[i % ENVIRONMENTS.length],
		region: REGIONS[i % REGIONS.length],
	};
	try {
		await autumn.track({
			customer_id: customerId,
			feature_id: feature,
			value: 1 + (i % 3),
			properties,
		});
		sent++;
	} catch (error) {
		console.log(`track failed on ${feature}: ${(error as Error).message}`);
		if (feature === FEATURES[0]) {
			feature = FEATURES[1];
			i--;
			continue;
		}
		break;
	}
}

console.log(`seeded ${sent} events (feature: ${feature}) for ${customerId}`);
