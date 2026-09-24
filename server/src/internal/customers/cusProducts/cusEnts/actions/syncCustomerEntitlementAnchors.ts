import {
	EntInterval,
	getCycleEnd,
	isBooleanEntitlement,
	isCustomerProductExpired,
	isCustomerProductOneOff,
	isLifetimeEntitlement,
	PooledBalanceResetMode,
	pooledBalances,
	secondsToMs,
} from "@autumn/shared";
import { eq } from "drizzle-orm";
import { createStripeCli } from "@/external/connect/createStripeCli";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { invalidateCachedFullSubject } from "@/internal/customers/cache/fullSubject/index.js";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer";
import { CusProductService } from "../../CusProductService";
import { CusEntService } from "../CusEntitlementService";

type SyncedAnchor = {
	nextResetAt: number;
	/** Set for pooled balances, which also carry the anchor on the pool row. */
	pooledBalanceId?: string;
	resetCycleAnchor?: number;
};

const getStripeBillingCycleAnchor = async ({
	ctx,
	subscriptionId,
}: {
	ctx: AutumnContext;
	subscriptionId: string;
}) => {
	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
	const subscription = await stripeCli.subscriptions.retrieve(subscriptionId);
	return secondsToMs(subscription.billing_cycle_anchor);
};

/** Pooled balances have no customer product, so anchor them to the pool's
 * Stripe subscription instead. */
const getSyncedPooledAnchor = async ({
	ctx,
	customerEntitlement,
	now,
}: {
	ctx: AutumnContext;
	customerEntitlement: Awaited<ReturnType<typeof CusEntService.getStrict>>;
	now: number;
}): Promise<SyncedAnchor | null> => {
	const pooledBalance = await ctx.db.query.pooledBalances.findFirst({
		where: eq(pooledBalances.customer_entitlement_id, customerEntitlement.id),
	});
	if (
		!pooledBalance ||
		pooledBalance.reset_mode !== PooledBalanceResetMode.Subscription ||
		!pooledBalance.stripe_subscription_id
	) {
		return null;
	}

	const anchor = await getStripeBillingCycleAnchor({
		ctx,
		subscriptionId: pooledBalance.stripe_subscription_id,
	});

	return {
		nextResetAt: getCycleEnd({
			anchor,
			interval: pooledBalance.interval,
			intervalCount: pooledBalance.interval_count,
			now,
		}),
		pooledBalanceId: pooledBalance.id,
		resetCycleAnchor: anchor,
	};
};

const getSyncedNextResetAt = async ({
	ctx,
	customerEntitlement,
	now,
}: {
	ctx: AutumnContext;
	customerEntitlement: Awaited<ReturnType<typeof CusEntService.getStrict>>;
	now: number;
}): Promise<SyncedAnchor | null> => {
	if (
		(customerEntitlement.expires_at != null &&
			customerEntitlement.expires_at <= now) ||
		isBooleanEntitlement({ entitlement: customerEntitlement.entitlement }) ||
		isLifetimeEntitlement({ entitlement: customerEntitlement.entitlement })
	) {
		return null;
	}

	if (customerEntitlement.is_pooled_balance) {
		return getSyncedPooledAnchor({ ctx, customerEntitlement, now });
	}

	const customerProductId = customerEntitlement.customer_product_id;
	if (!customerProductId) return null;

	const customerProduct = await CusProductService.getFull({
		db: ctx.db,
		id: customerProductId,
	});
	if (
		!customerProduct ||
		isCustomerProductExpired(customerProduct) ||
		isCustomerProductOneOff(customerProduct)
	) {
		return null;
	}

	const subscriptionId = customerProduct.subscription_ids?.[0];
	let anchor = customerProduct.starts_at;
	if (subscriptionId) {
		anchor = await getStripeBillingCycleAnchor({ ctx, subscriptionId });
	}
	if (anchor == null) return null;

	return {
		nextResetAt: getCycleEnd({
			anchor,
			interval: customerEntitlement.entitlement.interval ?? EntInterval.Month,
			intervalCount: customerEntitlement.entitlement.interval_count,
			now,
		}),
	};
};

export const syncCustomerEntitlementAnchors = async ({
	ctx,
	customerEntitlementIds,
}: {
	ctx: AutumnContext;
	customerEntitlementIds: string[];
}) => {
	const uniqueIds = [...new Set(customerEntitlementIds)];
	const customerEntitlements = await Promise.all(
		uniqueIds.map((id) =>
			CusEntService.getStrict({
				db: ctx.db,
				id,
				orgId: ctx.org.id,
				env: ctx.env,
			}),
		),
	);
	const now = Date.now();
	const updates = (
		await Promise.all(
			customerEntitlements.map(async (customerEntitlement) => ({
				customerEntitlement,
				synced: await getSyncedNextResetAt({
					ctx,
					customerEntitlement,
					now,
				}),
			})),
		)
	).filter(
		(
			update,
		): update is typeof update & {
			synced: SyncedAnchor;
		} => update.synced != null,
	);
	if (updates.length === 0) {
		return { updated: 0, skipped: uniqueIds.length };
	}

	await ctx.db.transaction(async (tx) => {
		const txCtx = { ...ctx, db: tx as unknown as typeof ctx.db };
		await Promise.all(
			updates.map(async ({ customerEntitlement, synced }) => {
				await CusEntService.update({
					ctx: txCtx,
					id: customerEntitlement.id,
					updates: {
						next_reset_at: synced.nextResetAt,
						...(synced.resetCycleAnchor != null && {
							reset_cycle_anchor: synced.resetCycleAnchor,
						}),
					},
					incrementCacheVersion: true,
				});

				if (synced.pooledBalanceId && synced.resetCycleAnchor != null) {
					await tx
						.update(pooledBalances)
						.set({
							reset_cycle_anchor: synced.resetCycleAnchor,
							updated_at: Date.now(),
						})
						.where(eq(pooledBalances.id, synced.pooledBalanceId));
				}
			}),
		);
	});

	const customerIds = new Set(
		updates.map(
			({ customerEntitlement }) =>
				customerEntitlement.customer.id ??
				customerEntitlement.customer.internal_id,
		),
	);
	// Balance reads come from the FullSubject cache, so drop it too or the old
	// reset date keeps being served.
	await Promise.all(
		[...customerIds].flatMap((customerId) => [
			deleteCachedFullCustomer({
				ctx,
				customerId,
				source: "syncCustomerEntitlementAnchors",
			}),
			invalidateCachedFullSubject({
				ctx,
				customerId,
				source: "syncCustomerEntitlementAnchors",
			}),
		]),
	);

	return {
		updated: updates.length,
		skipped: uniqueIds.length - updates.length,
	};
};
