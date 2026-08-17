import { getAutumnEnv } from "@autumn/env";
import type { AppEnv } from "@autumn/shared";
import Stripe from "stripe";
import {
	MAIN_STRIPE_EVENT_TYPES,
	SYNC_STRIPE_EVENT_TYPES,
} from "./common/stripeConstants";

export const checkKeyValid = async (apiKey: string) => {
	const stripe = new Stripe(apiKey);

	// Call customers.list
	await stripe.customers.list();
};

export const createWebhookEndpoint = async (
	apiKey: string,
	env: AppEnv,
	orgId: string,
) => {
	const stripe = new Stripe(apiKey);

	const webhookBaseUrl = getAutumnEnv().AUTUMN_PUBLIC_API_URL;

	const endpoint = await stripe.webhookEndpoints.create({
		url: `${webhookBaseUrl}/webhooks/stripe/${orgId}/${env}`,
		enabled_events: [...MAIN_STRIPE_EVENT_TYPES, ...SYNC_STRIPE_EVENT_TYPES],

		// [
		// 	"customer.subscription.created",
		// 	"customer.subscription.updated",
		// 	"customer.subscription.deleted",
		// 	"checkout.session.completed",
		// 	"invoice.paid",
		// 	"invoice.upcoming",
		// 	"invoice.created",
		// 	"invoice.finalized",
		// 	"invoice.updated",
		// 	"subscription_schedule.canceled",
		// 	"subscription_schedule.updated",
		// 	"customer.discount.deleted",
		// ],
	});

	return endpoint;
};
