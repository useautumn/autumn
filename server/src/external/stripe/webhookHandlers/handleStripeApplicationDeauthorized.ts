import { AppEnv, organizations } from "@autumn/shared";
import { eq, sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { invalidateProductsCache } from "@/external/redis/actions/productsCache/productsCache.js";
import { clearStripeCatalogMappings } from "@/internal/catalog/actions/catalogMappings/clearStripeCatalogMappings.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { clearOrgCache } from "@/internal/orgs/orgUtils/clearOrgCache.js";
import { isStripeConnected } from "@/internal/orgs/orgUtils.js";
import type { StripeWebhookContext } from "../webhookMiddlewares/stripeWebhookContext.js";
import { isStripeAuthorizationCurrent } from "./isStripeAuthorizationCurrent.js";
import { restoreStripeWebhookAfterRevocation } from "./restoreStripeWebhookAfterRevocation.js";

export const handleStripeApplicationDeauthorized = async ({
	ctx,
}: {
	ctx: StripeWebhookContext;
}) => {
	const { db, env, logger, stripeEvent } = ctx;
	const accountId = stripeEvent.account;
	if (!accountId) return;

	const org = await OrgService.get({ db, orgId: ctx.org.id });
	const connectField =
		env === AppEnv.Live ? "live_stripe_connect" : "test_stripe_connect";
	const connect = org[connectField];
	if (
		connect?.account_id === accountId &&
		(await isStripeAuthorizationCurrent({
			ctx,
			connectedAt: connect.connected_at,
			accountId,
			eventCreated: stripeEvent.created,
		}))
	)
		return;

	const revoked = await db.transaction(async (tx) => {
		const [currentOrg] = await tx
			.select()
			.from(organizations)
			.where(eq(organizations.id, org.id))
			.for("update");
		if (!currentOrg) return false;
		const currentConnect = currentOrg[connectField];
		const isPending =
			currentConnect?.revoked_account_id === accountId &&
			!currentConnect.account_id;
		const isSameAuthorization =
			connect?.account_id === accountId &&
			currentConnect?.account_id === accountId &&
			currentConnect.connected_at === connect?.connected_at;
		if (!isPending && !isSameAuthorization) return false;

		await tx
			.update(organizations)
			.set({
				[connectField]: sql`(${organizations[connectField]} - 'account_id' - 'connected_at') || ${JSON.stringify({ revoked_account_id: accountId })}::jsonb`,
			})
			.where(eq(organizations.id, org.id));
		if (
			!isStripeConnected({
				org: { ...currentOrg, master: org.master },
				env,
				throughSecretKey: true,
			})
		) {
			await clearStripeCatalogMappings({
				db: tx as unknown as DrizzleCli,
				orgId: org.id,
				env,
			});
		}
		return true;
	});
	if (!revoked) return;

	await clearOrgCache({ db, orgId: org.id, env, logger });
	await invalidateProductsCache({ orgId: org.id, env });
	await restoreStripeWebhookAfterRevocation({ ctx, accountId });
};
