import type { AppEnv } from "@autumn/shared";
import type { Context } from "hono";
import type Stripe from "stripe";
import { JobName } from "@/queue/JobName.js";
import { addTaskToQueue } from "@/queue/queueUtils.js";
import {
	getStripeSubscriptionLock,
	type StripeSubscriptionLock,
} from "./subscriptions/utils/lockStripeSubscriptionUtils.js";
import type {
	StripeWebhookContext,
	StripeWebhookHonoEnv,
} from "./webhookMiddlewares/stripeWebhookContext.js";

export type StripeWebhookQueuePayload = {
	orgId: string;
	env: AppEnv;
	event: Stripe.Event;
	requestId: string;
	receivedAtMs: number;
	ingressSubscriptionLock?: {
		stripeSubscriptionId: string;
		lock: StripeSubscriptionLock;
	};
};

export const getStripeCustomerId = ({
	event,
}: {
	event: Stripe.Event;
}): string | undefined => {
	const object = event.data.object as {
		customer?: string | { id?: string };
		id?: string;
	};
	const customer =
		typeof object.customer === "string" ? object.customer : object.customer?.id;

	if (customer) return customer;
	if (
		event.type === "customer.updated" ||
		event.type === "customer.discount.deleted"
	) {
		return object.id;
	}
};

export const getStripeWebhookQueueIds = ({
	event,
	orgId,
	env,
}: {
	event: Stripe.Event;
	orgId: string;
	env: AppEnv;
}) => ({
	messageGroupId: `${orgId}:${env}:${getStripeCustomerId({ event }) ?? event.account ?? "global"}`,
	messageDeduplicationId: `${orgId}:${env}:${event.id}`,
});

type Enqueue = typeof addTaskToQueue;
type GetSubscriptionLock = typeof getStripeSubscriptionLock;

export const enqueueStripeWebhook = async ({
	ctx,
	queueUrl = process.env.STRIPE_WEBHOOK_SQS_QUEUE_URL,
	enqueue = addTaskToQueue,
	getSubscriptionLock = getStripeSubscriptionLock,
}: {
	ctx: StripeWebhookContext;
	queueUrl?: string;
	enqueue?: Enqueue;
	getSubscriptionLock?: GetSubscriptionLock;
}) => {
	if (!queueUrl) {
		throw new Error("STRIPE_WEBHOOK_SQS_QUEUE_URL is not configured");
	}
	if (!queueUrl.endsWith(".fifo")) {
		throw new Error("STRIPE_WEBHOOK_SQS_QUEUE_URL must reference a FIFO queue");
	}

	const object = ctx.stripeEvent.data.object as { id?: string };
	const stripeSubscriptionId = [
		"customer.subscription.updated",
		"customer.subscription.deleted",
	].includes(ctx.stripeEvent.type)
		? object.id
		: undefined;
	const lock = stripeSubscriptionId
		? await getSubscriptionLock({ stripeSubscriptionId })
		: null;
	const payload: StripeWebhookQueuePayload = {
		orgId: ctx.org.id,
		env: ctx.env,
		event: ctx.stripeEvent,
		requestId: ctx.id,
		receivedAtMs: ctx.timestamp,
		...(stripeSubscriptionId &&
			lock && {
				ingressSubscriptionLock: { stripeSubscriptionId, lock },
			}),
	};
	const queueIds = getStripeWebhookQueueIds({
		event: ctx.stripeEvent,
		orgId: ctx.org.id,
		env: ctx.env,
	});

	await enqueue({
		jobName: JobName.StripeWebhook,
		payload,
		queueUrl,
		...queueIds,
	});
};

export const queueStripeWebhook = async (c: Context<StripeWebhookHonoEnv>) => {
	const ctx = c.get("ctx");

	try {
		await enqueueStripeWebhook({ ctx });
		return c.json({ received: true }, 200);
	} catch (error) {
		ctx.logger.error(`Failed to enqueue Stripe webhook: ${error}`, { error });
		return c.json({ error: "Failed to enqueue Stripe webhook" }, 503);
	}
};
