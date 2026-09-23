import { AppEnv, type Organization } from "@autumn/shared";
import { OrgService } from "@/internal/orgs/OrgService.js";
import type { StripeWebhookContext } from "../webhookMiddlewares/stripeWebhookContext.js";
import { clearRevokedStripeConnection } from "./clearRevokedStripeConnection.js";
import { isStripeAuthorizationCurrent } from "./isStripeAuthorizationCurrent.js";

const revokeOrgConnection = async ({
	ctx,
	org,
	accountId,
}: {
	ctx: StripeWebhookContext;
	org: Organization;
	accountId: string;
}) => {
	const { env, stripeEvent } = ctx;
	const connect =
		env === AppEnv.Live ? org.live_stripe_connect : org.test_stripe_connect;
	const orgCtx = { ...ctx, org };
	if (
		connect?.account_id === accountId &&
		(await isStripeAuthorizationCurrent({
			ctx: orgCtx,
			connectedAt: connect.connected_at,
			accountId,
			eventCreated: stripeEvent.created,
		}))
	)
		return;
	await clearRevokedStripeConnection({ ctx: orgCtx, accountId });
};

export const handleStripeApplicationDeauthorized = async ({
	ctx,
}: {
	ctx: StripeWebhookContext;
}) => {
	const { db, env, stripeEvent } = ctx;
	const accountId = stripeEvent.account;
	if (!accountId) return;
	const orgs = await OrgService.listByDeauthorizedAccount({
		db,
		accountId,
		env,
	});
	// Legacy rows can share one OAuth grant; clear all of them before surfacing a failure.
	const results = await Promise.allSettled(
		orgs.map((org) => revokeOrgConnection({ ctx, org, accountId })),
	);
	const failure = results.find((result) => result.status === "rejected");
	if (failure) throw failure.reason;
};
