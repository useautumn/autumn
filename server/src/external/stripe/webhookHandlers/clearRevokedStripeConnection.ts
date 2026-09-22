import { AppEnv, type Organization, organizations } from "@autumn/shared";
import { eq, sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { invalidateProductsCache } from "@/external/redis/actions/productsCache/productsCache.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { clearStripeCatalogMappings } from "@/internal/catalog/actions/catalogMappings/clearStripeCatalogMappings.js";
import { clearOrgCache } from "@/internal/orgs/orgUtils/clearOrgCache.js";
import { isStripeConnected } from "@/internal/orgs/orgUtils.js";
import { restoreStripeWebhookAfterRevocation } from "./restoreStripeWebhookAfterRevocation.js";

export const clearRevokedStripeConnection = async ({
	ctx,
	accountId,
	deauthorize,
}: {
	ctx: Pick<AutumnContext, "org" | "env" | "db" | "logger">;
	accountId: string;
	deauthorize?: (params: {
		db: DrizzleCli;
		org: Organization;
	}) => Promise<void>;
}) => {
	const { db, env, logger, org } = ctx;
	const connectField =
		env === AppEnv.Live ? "live_stripe_connect" : "test_stripe_connect";
	const connect = org[connectField];
	const revoked = await db.transaction(async (tx) => {
		await tx.execute(
			sql`SELECT pg_advisory_xact_lock(hashtextextended(${`stripe-oauth:${env}:${accountId}`}, 0))`,
		);
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
			currentConnect.connected_at === connect?.connected_at &&
			currentConnect.master_org_id === connect?.master_org_id;
		if (!isPending && !isSameAuthorization)
			return !currentConnect?.account_id && !currentConnect?.revoked_account_id;
		if (deauthorize && !isPending)
			await deauthorize({
				db: tx as unknown as DrizzleCli,
				org: { ...currentOrg, master: org.master },
			});
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
	if (!revoked) return false;
	await clearOrgCache({ db, orgId: org.id, env, logger });
	await invalidateProductsCache({ orgId: org.id, env });
	await restoreStripeWebhookAfterRevocation({ ctx, accountId });
	return true;
};
