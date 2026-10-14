import { getAutumnEnv } from "@autumn/env";
import type { AppEnv } from "@autumn/shared";
import Stripe from "stripe";
import {
	MAIN_STRIPE_EVENT_TYPES,
	SYNC_STRIPE_EVENT_TYPES,
} from "./common/stripeConstants";

export const checkKeyValid = async (apiKey: string) => {
	const stripe = new Stripe(apiKey);

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
	});

	return endpoint;
};
