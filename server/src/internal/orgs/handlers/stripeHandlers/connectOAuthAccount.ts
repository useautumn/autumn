import { AppEnv, organizations } from "@autumn/shared";
import { and, eq, ne, sql } from "drizzle-orm";
import type Stripe from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { clearOrgCache } from "@/internal/orgs/orgUtils/clearOrgCache.js";
import { isStripeConnected } from "@/internal/orgs/orgUtils.js";

export const connectOAuthAccount = async ({
	db,
	orgId,
	accountId,
	env,
	stripe,
	masterOrgId,
}: {
	db: DrizzleCli;
	orgId: string;
	accountId: string;
	env: AppEnv;
	stripe: Stripe;
	masterOrgId: string | null;
}) => {
	const result = await db.transaction(async (tx) => {
		await tx.execute(
			sql`select pg_advisory_xact_lock(hashtextextended(${`stripe-oauth:${env}:${accountId}`}, 0))`,
		);
		const [orgRow] = await tx
			.select()
			.from(organizations)
			.where(eq(organizations.id, orgId))
			.for("update");
		if (!orgRow) return { error: "org_not_found" } as const;
		const org = { ...orgRow, master: null };
		if (masterOrgId && org.created_by !== masterOrgId)
			return { error: "org_not_found" } as const;
		const field =
			env === AppEnv.Live ? "live_stripe_connect" : "test_stripe_connect";
		const [conflict] = await tx
			.select({
				name: organizations.name,
				slug: organizations.slug,
				createdAt: organizations.createdAt,
				created_by: organizations.created_by,
			})
			.from(organizations)
			.where(
				and(
					ne(organizations.id, org.id),
					eq(sql`${organizations[field]}->>'account_id'`, accountId),
				),
			)
			.limit(1);
		if (conflict)
			return {
				error: "account_already_connected",
				conflict,
				targetOwner: org.created_by,
			} as const;
		if (isStripeConnected({ org, env, throughSecretKey: true })) {
			try {
				const secretKeyAccount = await createStripeCli({
					org,
					env,
					throughSecretKey: true,
				}).accounts.retrieve();
				if (secretKeyAccount.id !== accountId)
					return {
						error: "account_mismatch",
						secretKeyAccountId: secretKeyAccount.id,
					} as const;
			} catch {
				return { error: "account_mismatch_check_failed" } as const;
			}
		}
		await stripe.balance.retrieve({}, { stripeAccount: accountId });
		const {
			revoked_account_id: _revokedAccountId,
			master_org_id: _masterOrgId,
			...connect
		} = org[field] ?? {};
		await tx
			.update(organizations)
			.set({
				[field]: {
					...connect,
					account_id: accountId,
					connected_at: Date.now(),
				},
			})
			.where(eq(organizations.id, org.id));
		return { error: null } as const;
	});
	if (!result.error) await clearOrgCache({ db, orgId });
	return result;
};
