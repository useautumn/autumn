import {
	STRIPE_REQUEST_OPTIONS,
	withStripeRequestSlot,
} from "@tw/helpers/stripeRequestBudget.ts";
import { eq } from "drizzle-orm";
import { stripeKeys } from "../../../db/schema/keys.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import { withRateLimitRetry } from "../stripeErrors.ts";
import { CONNECT_WEBHOOK_EVENTS, stripeForKey } from "../stripeForKey.ts";

/** Every endpoint on the key goes, not just ours: stale ones from old `bun tw` runs pile up to Stripe's cap. */
export const deleteAllWebhooks = async ({
	ctx,
	platformAccountId,
	secret,
}: {
	ctx: TwdContext;
	platformAccountId: string;
	secret: string;
}): Promise<number> => {
	const stripe = stripeForKey({ secret });
	const ids: string[] = [];
	for await (const endpoint of stripe.webhookEndpoints.list({ limit: 100 })) {
		ids.push(endpoint.id);
	}
	for (const id of ids) {
		try {
			await withRateLimitRetry(() =>
				withStripeRequestSlot(() =>
					stripe.webhookEndpoints.del(id, undefined, STRIPE_REQUEST_OPTIONS),
				),
			);
		} catch (error) {
			if ((error as { code?: string }).code !== "resource_missing") throw error;
		}
	}
	await ctx.db
		.update(stripeKeys)
		.set({ connectWebhookId: null, updatedAt: new Date() })
		.where(eq(stripeKeys.platformAccountId, platformAccountId));
	return ids.length;
};

/** One Connect webhook → `<TWD_PUBLIC_URL>/ingress/connect/sandbox`; recorded on stripe_keys. */
export const registerConnectWebhook = async ({
	ctx,
	platformAccountId,
	secret,
}: {
	ctx: TwdContext;
	platformAccountId: string;
	secret: string;
}): Promise<string> => {
	const publicUrl = ctx.env.TWD_PUBLIC_URL.replace(/\/+$/, "");
	const endpoint = await withStripeRequestSlot(() =>
		stripeForKey({ secret }).webhookEndpoints.create(
			{
				url: `${publicUrl}/ingress/connect/sandbox`,
				enabled_events: CONNECT_WEBHOOK_EVENTS,
				connect: true,
			},
			STRIPE_REQUEST_OPTIONS,
		),
	);
	await ctx.db
		.update(stripeKeys)
		.set({ connectWebhookId: endpoint.id, updatedAt: new Date() })
		.where(eq(stripeKeys.platformAccountId, platformAccountId));
	return endpoint.id;
};
