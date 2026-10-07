import { AppEnv } from "@autumn/shared";
import defaultCtx from "@tests/utils/testInitUtils/createTestContext";
import type Stripe from "stripe";
import { getMiscRedis } from "@/external/redis/initRedis";
import { buildStripeWebhookEventKey } from "@/external/stripe/webhookMiddlewares/stripeIdempotencyMiddleware";
import { OrgService } from "@/internal/orgs/OrgService";

export type StripeWebhookEventStatus = "completed" | "processing" | "missing";

const orgIdsByAccount = new Map<string, Promise<string>>();

const getEventOrgId = ({ event }: { event: Stripe.Event }) => {
	if (!event.account) return Promise.resolve(defaultCtx.org.id);
	let orgId = orgIdsByAccount.get(event.account);
	if (!orgId) {
		orgId = OrgService.getByAccountId({
			db: defaultCtx.db,
			accountId: event.account,
		}).then(({ org }) => org.id);
		orgIdsByAccount.set(event.account, orgId);
	}
	return orgId;
};

/** Reads the idempotency marker Autumn's webhook route sets once it has fully processed an event. */
export const readStripeWebhookEventStatus = async ({
	event,
}: {
	event: Stripe.Event;
}): Promise<StripeWebhookEventStatus> => {
	const redis = getMiscRedis();
	if (redis.status !== "ready")
		throw new Error(
			`Misc Redis is ${redis.status}; cannot read webhook markers`,
		);
	const eventKey = buildStripeWebhookEventKey({
		orgId: await getEventOrgId({ event }),
		env: event.livemode ? AppEnv.Live : AppEnv.Sandbox,
		eventId: event.id,
	});
	const marker = await redis.get(eventKey);
	if (marker === null) return "missing";
	return marker === "completed" ? "completed" : "processing";
};
