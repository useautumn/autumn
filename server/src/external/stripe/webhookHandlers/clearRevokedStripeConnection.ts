import { organizations } from "@autumn/shared";
import { and, eq, isNull, or, type SQL, sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import {
	orgToStripeConnect,
	stripeConnectField,
} from "@/external/connect/stripeConnectField.js";
import { invalidateProductsCache } from "@/external/redis/actions/productsCache/productsCache.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { clearStripeCatalogMappings } from "@/internal/catalog/actions/catalogMappings/clearStripeCatalogMappings.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { clearOrgCache } from "@/internal/orgs/orgUtils/clearOrgCache.js";
import { isStripeConnected } from "@/internal/orgs/orgUtils.js";
import { restoreStripeWebhookAfterRevocation } from "./restoreStripeWebhookAfterRevocation.js";

type Ctx = Pick<AutumnContext, "org" | "env" | "db" | "logger">;

/** Matches the connection the caller saw, or a revocation whose cleanup has not finished. */
const isRevocableConnection = ({
	ctx,
	accountId,
}: {
	ctx: Ctx;
	accountId: string;
}): SQL | undefined => {
	const connect = organizations[stripeConnectField(ctx.env)];
	const expected = orgToStripeConnect({ org: ctx.org, env: ctx.env });

	const isPendingRevocation = and(
		eq(sql`${connect}->>'revoked_account_id'`, accountId),
		isNull(sql`${connect}->>'account_id'`),
	);
	if (expected?.account_id !== accountId) return isPendingRevocation;

	const isSameAuthorization = and(
		eq(sql`${connect}->>'account_id'`, accountId),
		sql`${connect}->>'connected_at' IS NOT DISTINCT FROM ${expected.connected_at?.toString() ?? null}`,
		isNull(sql`${connect}->>'master_org_id'`),
	);

	return or(isPendingRevocation, isSameAuthorization);
};

const markConnectionRevoked = async ({
	ctx,
	accountId,
}: {
	ctx: Ctx;
	accountId: string;
}): Promise<boolean> => {
	const { db, env, org } = ctx;
	const field = stripeConnectField(env);
	const revokedMarker = JSON.stringify({ revoked_account_id: accountId });

	return db.transaction(async (tx) => {
		const [revokedOrg] = await tx
			.update(organizations)
			.set({
				[field]: sql`(${organizations[field]} - 'account_id' - 'connected_at') || ${revokedMarker}::jsonb`,
			})
			.where(
				and(
					eq(organizations.id, org.id),
					isRevocableConnection({ ctx, accountId }),
				),
			)
			.returning();
		if (!revokedOrg) return false;

		const secretKeyRemains = isStripeConnected({
			org: { ...revokedOrg, master: org.master },
			env,
			throughSecretKey: true,
		});
		if (!secretKeyRemains) {
			await clearStripeCatalogMappings({
				db: tx as unknown as DrizzleCli,
				orgId: org.id,
				env,
			});
		}

		return true;
	});
};

/** Returns false when the connection changed since the caller read it. */
export const clearRevokedStripeConnection = async ({
	ctx,
	accountId,
}: {
	ctx: Ctx;
	accountId: string;
}) => {
	const { db, env, logger, org } = ctx;

	const revoked = await markConnectionRevoked({ ctx, accountId });
	if (!revoked) {
		const current = orgToStripeConnect({
			org: await OrgService.get({ db, orgId: org.id }),
			env,
		});
		return !current?.account_id && !current?.revoked_account_id;
	}

	await clearOrgCache({ db, orgId: org.id, env, logger });
	await invalidateProductsCache({ orgId: org.id, env });
	await restoreStripeWebhookAfterRevocation({ ctx, accountId });
	return true;
};
