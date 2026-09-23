import "dotenv/config";
import { getAutumnEnv } from "@autumn/env";
import { AppEnv } from "@autumn/shared";
import Stripe from "stripe";
import { buildOAuthConnectWebhookParams } from "./src/external/stripe/common/stripeConstants";
import { loadLocalEnv } from "./src/utils/envUtils";

loadLocalEnv();

const main = async () => {
	const stripe = new Stripe(process.env.STRIPE_SANDBOX_SECRET_KEY || "");

	const result = await stripe.webhookEndpoints.create(
		buildOAuthConnectWebhookParams({
			publicApiUrl: getAutumnEnv().AUTUMN_PUBLIC_API_URL,
			env: AppEnv.Sandbox,
		}),
	);

	console.log(result);
};

main()
	.catch(console.error)
	.then(() => process.exit(0));
