import "dotenv/config";
import { loadLocalEnv } from "./src/utils/envUtils";
import Stripe from "stripe";
import {
	MAIN_STRIPE_EVENT_TYPES,
	SYNC_STRIPE_EVENT_TYPES,
} from "./src/external/stripe/common/stripeConstants";

loadLocalEnv();

const allEventTypes = [
	...new Set([...MAIN_STRIPE_EVENT_TYPES, ...SYNC_STRIPE_EVENT_TYPES]),
] as Stripe.WebhookEndpointCreateParams.EnabledEvent[];

const main = async () => {
	const stripe = new Stripe(process.env.STRIPE_SANDBOX_SECRET_KEY || "");

	const result = await stripe.webhookEndpoints.create({
		url: `${process.env.STRIPE_WEBHOOK_URL}/webhooks/connect/sandbox`,
		enabled_events: allEventTypes,
		connect: true,
	});

	console.log(result);
};

main()
	.catch(console.error)
	.then(() => process.exit(0));
