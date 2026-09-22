import { AppEnv } from "@autumn/shared";
import { OrgService } from "@/internal/orgs/OrgService.js";
import type { StripeWebhookContext } from "../webhookMiddlewares/stripeWebhookContext.js";
import { clearRevokedStripeConnection } from "./clearRevokedStripeConnection.js";
import { isStripeAuthorizationCurrent } from "./isStripeAuthorizationCurrent.js";

export const handleStripeApplicationDeauthorized = async ({
	ctx,
}: {
	ctx: StripeWebhookContext;
}) => {
	const { db, env, stripeEvent } = ctx;
	const accountId = stripeEvent.account;
	if (!accountId) return;
	const org = await OrgService.get({ db, orgId: ctx.org.id });
	const connect =
		env === AppEnv.Live ? org.live_stripe_connect : org.test_stripe_connect;
	if (
		connect?.account_id === accountId &&
		(await isStripeAuthorizationCurrent({
			ctx: { ...ctx, org },
			connectedAt: connect.connected_at,
			accountId,
			eventCreated: stripeEvent.created,
		}))
	)
		return;
	await clearRevokedStripeConnection({ ctx: { ...ctx, org }, accountId });
};
