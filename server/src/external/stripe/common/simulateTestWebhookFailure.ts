import { stripeRefToId, tryCatch } from "@autumn/shared";
import type Stripe from "stripe";
import type { StripeWebhookContext } from "../webhookMiddlewares/stripeWebhookContext.js";

export const TEST_WEBHOOK_FAIL_METADATA_KEY = "test_webhook_fail";

type EventObjectWithMetadata = {
	id?: string;
	object?: string;
	metadata?: Record<string, string> | null;
	customer?: string | { id: string } | null;
};

const retrieveLiveMetadata = async ({
	stripeCli,
	object,
}: {
	stripeCli: Stripe;
	object: EventObjectWithMetadata;
}): Promise<Record<string, string> | null | undefined> => {
	if (!object.id) return object.metadata;

	switch (object.object) {
		case "checkout.session": {
			const session = await stripeCli.checkout.sessions.retrieve(object.id);
			return session.metadata;
		}
		case "subscription": {
			const subscription = await stripeCli.subscriptions.retrieve(object.id);
			return subscription.metadata;
		}
		case "invoice": {
			const invoice = await stripeCli.invoices.retrieve(object.id);
			return invoice.metadata;
		}
		default:
			return object.metadata;
	}
};

const retrieveLiveCustomerMetadata = async ({
	stripeCli,
	object,
}: {
	stripeCli: Stripe;
	object: EventObjectWithMetadata;
}): Promise<Record<string, string> | null | undefined> => {
	const customerId = stripeRefToId(object.customer);
	if (!customerId) return object.metadata;

	const customer = await stripeCli.customers.retrieve(customerId);
	return customer.deleted ? undefined : customer.metadata;
};

export const throwOnSimulatedWebhookFailure = async ({
	ctx,
}: {
	ctx: StripeWebhookContext;
}) => {
	if (process.env.NODE_ENV === "production") return;

	const event = ctx.stripeEvent;
	const object = event.data.object as EventObjectWithMetadata;
	const markerValue = object?.metadata?.[TEST_WEBHOOK_FAIL_METADATA_KEY];
	if (!markerValue) return;

	const { data: liveMetadata, error } = await tryCatch(
		markerValue === "customer"
			? retrieveLiveCustomerMetadata({ stripeCli: ctx.stripeCli, object })
			: retrieveLiveMetadata({ stripeCli: ctx.stripeCli, object }),
	);
	if (error) return;

	if (liveMetadata?.[TEST_WEBHOOK_FAIL_METADATA_KEY]) {
		throw new Error(
			`Simulated webhook failure for ${event.type} ${event.id} — remove ${TEST_WEBHOOK_FAIL_METADATA_KEY} metadata from the live ${markerValue === "customer" ? "customer" : object.object} to let it pass`,
		);
	}
};
