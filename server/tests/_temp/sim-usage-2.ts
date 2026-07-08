import { ApiVersion } from "@autumn/shared";
import { AutumnInt } from "../../src/external/autumn/autumnCli.js";

const autumn = new AutumnInt({ version: ApiVersion.V2_3 });
const customerId = "props-demo";

const track = async (apiKeyId: string, value: number, note: string) => {
	await autumn.track({
		customer_id: customerId,
		feature_id: "messages",
		value,
		properties: { apiKeyId },
	});
	console.log(`tracked ${value} on ${apiKeyId} (${note})`);
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

await track("sk_live_1050", 30, "both caps have room: applies 30");
await track("sk_live_0001", 20, "no filtered cap: total cap only, applies 20");
await track("sk_live_1057", 10, "filtered cap exhausted: applies 0");
await track(
	"sk_live_1050",
	80,
	"filtered headroom 720 but TOTAL headroom 50: applies 50",
);
await track("sk_live_0001", 10, "total cap exhausted: applies 0");

await check("sk_live_1050"); // filtered has room, total does not -> false
await check("sk_live_0001"); // total exhausted -> false
await check(); // total exhausted -> false

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
	console.log(
		`limit [${filter || "unfiltered"}]: ${entry.usage}/${entry.limit}`,
	);
}
const balance = customer.balances?.messages;
console.log(
	`messages balance: usage=${balance?.usage}, remaining=${balance?.remaining}`,
);
process.exit(0);
