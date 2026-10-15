import { waitForStripeWebhook } from "@tests/utils/stripeUtils/waitForStripeWebhook";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { getMiscRedis } from "@/external/redis/miscCache/getMiscRedis";
import { buildStripeWebhookEventKey } from "@/external/stripe/webhookMiddlewares/stripeIdempotencyMiddleware";

const COMPLETED = "completed";

/**
 * Waits until Autumn has finished handling the Stripe `type` event on
 * `objectId`, read from the idempotency key the webhook pipeline marks
 * completed once the handler returns. Lets a test assert an event changed
 * nothing, which polling for an effect cannot.
 */
export const waitForStripeEventHandled = async ({
	ctx,
	type,
	objectId,
	since,
}: {
	ctx: TestContext;
	type: string;
	objectId: string;
	since: number;
}) => {
	const findEvent = async () => {
		const events = await ctx.stripeCli.events.list({
			type,
			created: { gte: Math.floor(since / 1000) },
			limit: 25,
		});
		return events.data.find(
			(event) => (event.data.object as { id?: string }).id === objectId,
		);
	};

	await waitForStripeWebhook({
		stripeCli: ctx.stripeCli,
		env: ctx.env,
		types: [type],
		objectId,
		since,
		until: async () => {
			const event = await findEvent();
			if (!event) return false;

			const eventKey = buildStripeWebhookEventKey({
				orgId: ctx.org.id,
				env: ctx.env,
				eventId: event.id,
			});
			return (await getMiscRedis().get(eventKey)) === COMPLETED;
		},
	});
};
