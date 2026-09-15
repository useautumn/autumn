import Stripe from "stripe";
import { applyTwStripeConcurrencyLimit } from "../../../../src/external/connect/clientCache/twStripeConcurrencyLimit";

const secret = process.env.TW_STRIPE_PROBE_SECRET;
if (!secret?.startsWith("sk_test_processes_"))
	throw new Error("Synthetic probe key required");
const sent: number[] = [];
const client = applyTwStripeConcurrencyLimit({
	client: new Stripe(secret, {
		maxNetworkRetries: 0,
		httpClient: Stripe.createFetchHttpClient(async () => {
			sent.push(Date.now());
			return Response.json({
				object: "balance",
				available: [],
				pending: [],
				livemode: false,
			});
		}),
	}),
});
await Promise.all(Array.from({ length: 3 }, () => client.balance.retrieve()));
console.log(JSON.stringify(sent));
process.exit(0);
