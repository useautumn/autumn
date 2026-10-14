import { ApiVersion, EntInterval } from "@autumn/shared";
import { AutumnInt } from "../../src/external/autumn/autumnCli.js";

const autumn = new AutumnInt({ version: ApiVersion.V2_3 });
const customerId = "props-demo";

const track = async (apiKeyId: string, value: number) => {
	await autumn.track({
		customer_id: customerId,
		feature_id: "messages",
		value,
		properties: { apiKeyId },
	});
	console.log(`tracked ${value} on ${apiKeyId}`);
};

const check = async (apiKeyId?: string) => {
	const result = await autumn.check({
		customer_id: customerId,
		feature_id: "messages",
		required_balance: 1,
		...(apiKeyId && { properties: { apiKeyId } }),
	});
	console.log(
		`check ${apiKeyId ?? "(no properties)"}: allowed=${result.allowed}`,
	);
};

await autumn
	.post("/balances.create", {
		customer_id: customerId,
		feature_id: "messages",
		included_grant: 5000,
		reset: { interval: EntInterval.Month },
	})
	.then(() => console.log("granted 5000 messages/month"))
	.catch((error: Error) => console.log(`balance grant: ${error.message}`));

await track("sk_live_1057", 25);
await track("sk_live_1057", 15);
await track("sk_live_1050", 250);
await track("sk_live_0001", 60);
await track("sk_live_1057", 80);

await check("sk_live_1057");
await check("sk_live_1050");
await check();

const customer = (await autumn.customers.get(customerId)) as {
	billing_controls?: {
		usage_limits?: Array<{
			limit: number;
			usage?: number;
			filter?: { properties?: Record<string, string> };
		}>;
	};
	balances?: Record<string, { usage?: number; remaining?: number }>;
};
for (const entry of customer.billing_controls?.usage_limits ?? []) {
	const filter = Object.entries(entry.filter?.properties ?? {})
		.map(([k, v]) => `${k}=${v}`)
		.join(",");
	console.log(`limit [${filter || "unfiltered"}]: ${entry.usage}/${entry.limit}`);
}
console.log("messages balance:", JSON.stringify(customer.balances?.messages));
process.exit(0);
