import { AuthType, type Organization } from "@autumn/shared";
import express, { type Router } from "express";
import stripe, { type Stripe } from "stripe";
import { OrgService } from "@/internal/orgs/OrgService.js";
import {
	getStripeWebhookSecret,
	isStripeConnected,
} from "@/internal/orgs/orgUtils.js";
import { handleRequestError } from "@/utils/errorUtils.js";
import { handleStripeWebhookEvent } from "./handleStripeWebhookEvent.js";

export const stripeWebhookRouter: Router = express.Router();

stripeWebhookRouter.post(
	"/:orgId/:env",
	express.raw({ type: "application/json" }),
	async (request: any, response: any) => {
		const sig = request.headers["stripe-signature"];
		let event: Stripe.Event;

		const { orgId, env } = request.params;
		const { db } = request;

		let org: Organization;

		const data = await OrgService.getWithFeatures({
			db: request.db,
			orgId,
			env,
			allowNotFound: true,
		});

		if (!data) {
			response.status(200).send(`Org ${orgId} not found`);
			return;
		}

		request.org = data.org;
		request.features = data.features;
		request.env = env;
		org = data.org;

		if (!isStripeConnected({ org, env })) {
			console.log(`Org ${orgId} and env ${env} is not connected to stripe`);
			response
				.status(200)
				.send(`Org ${orgId} and env ${env} is not connected to stripe`);
			return;
		}

		try {
			const webhookSecret = getStripeWebhookSecret(org, env);

			event = await stripe.webhooks.constructEventAsync(
				request.body,
				sig,
				webhookSecret,
			);
		} catch (err: any) {
			response.status(400).send(`Webhook Error: ${err.message}`);
			return;
		}

		// event = JSON.parse(request.body);

		try {
			request.body = JSON.parse(request.body);
			request.authType = AuthType.Stripe;
		} catch (error) {
			console.log("Error parsing body", error);
		}

		// event = request.body;

		request.logger = request.logger.child({
			context: {
				context: {
					// body: request.body,
					event_type: event.type,
					event_id: event.id,
					// @ts-expect-error
					object_id: `${event.data?.object?.id}` || "N/A",
					authType: AuthType.Stripe,
					org_id: orgId,
					org_slug: org.slug,
					env,
				},
			},
		});

		const logger = request.logger;

		try {
			await handleStripeWebhookEvent({
				event,
				db,
				org,
				env,
				logger,
				req: request,
			});
			response.status(200).send();
		} catch (error) {
			handleRequestError({
				req: request,
				error,
				res: response,
				action: "stripe webhook",
			});
		}
	},
);
