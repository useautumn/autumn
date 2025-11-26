import "dotenv/config";
import { loadLocalEnv } from "./src/utils/envUtils";
import Stripe from "stripe";

loadLocalEnv();

const main = async () => {
	const stripe = new Stripe(process.env.STRIPE_SANDBOX_SECRET_KEY || "");
	

	const result = await stripe.webhookEndpoints.create({
		url: `${process.env.STRIPE_WEBHOOK_URL}/webhooks/connect/sandbox`,
		enabled_events: [
			"checkout.session.completed",
			"customer.subscription.created",
			"customer.subscription.updated",
			"customer.subscription.deleted",
			"customer.discount.deleted",
			"invoice.paid",
			"invoice.upcoming",
			"invoice.created",
			"invoice.finalized",
			"invoice.updated",
			"subscription_schedule.canceled",
			"subscription_schedule.updated",
		],
		connect: true,
	});

	console.log(result);
};

main()
	.catch(console.error)
	.then(() => process.exit(0));
