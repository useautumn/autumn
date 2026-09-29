import {
	CusProductStatus,
	clampNextResetAtToPendingBillingCycleAnchor,
	EntInterval,
	ErrCode,
	type FullCusProduct,
	type FullCustomer,
	filterCustomerProductsByStripeSubscriptionId,
	findCustomerProductById,
	getCycleEnd,
	isBooleanEntitlement,
	isCustomerProductExpired,
	isCustomerProductOneOff,
	isCustomerProductPaidRecurring,
	isLifetimeEntitlement,
	PooledBalanceResetMode,
	pooledBalances,
	secondsToMs,
} from "@autumn/shared";
import { eq } from "drizzle-orm";
import { StatusCodes } from "http-status-codes";
import { createStripeCli } from "@/external/connect/createStripeCli";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { CusService } from "@/internal/customers/CusService.js";
import { invalidateCachedFullSubject } from "@/internal/customers/cache/fullSubject/index.js";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer";
import RecaseError from "@/utils/errorUtils.js";
import { CusEntService } from "../CusEntitlementService";

type SyncedAnchor = {
	nextResetAt: number;
	/** Set for pooled balances, which also carry the anchor on the pool row. */
	pooledBalanceId?: string;
	resetCycleAnchor?: number;
};

type CustomerEntitlementToSync = Awaited<
	ReturnType<typeof CusEntService.getStrict>
>;

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

/** Stripe keeps the old anchor until a scheduled anchor lands, so the plan's pending date wins until then. */
const getPendingAnchorResetsAt = ({
	customerProducts,
	now,
}: {
	customerProducts: FullCusProduct[];
	now: number;
}): number | undefined => {
	const pendingResets = customerProducts
		.map((customerProduct) => customerProduct.billing_cycle_anchor_resets_at)
		.filter(
			(resetsAt): resetsAt is number =>
				typeof resetsAt === "number" && resetsAt > now,
		);
	return pendingResets.length > 0 ? Math.min(...pendingResets) : undefined;
};

/** Free plans have no subscription, so they follow the paid plan on the same customer or entity. */
const findPaidRecurringAnchorProduct = ({
	fullCustomer,
	customerProduct,
}: {
	fullCustomer: FullCustomer;
	customerProduct: FullCusProduct;
}) => {
	const paidRecurringProducts = fullCustomer.customer_products.filter(
		(candidate) =>
			candidate.status !== CusProductStatus.Scheduled &&
			candidate.subscription_ids?.length &&
			isCustomerProductPaidRecurring(candidate),
	);
	return (
		paidRecurringProducts.find(
			(candidate) =>
				candidate.internal_entity_id === customerProduct.internal_entity_id,
		) ??
		paidRecurringProducts.find((candidate) => !candidate.internal_entity_id)
	);
};

/** Pooled balances have no customer product, so anchor them to the pool's
 * Stripe subscription instead. */
const getSyncedPooledAnchor = async ({
	ctx,
	fullCustomer,
	customerEntitlement,
	now,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	customerEntitlement: CustomerEntitlementToSync;
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
		nextResetAt: clampNextResetAtToPendingBillingCycleAnchor({
			billingCycleAnchorResetsAt: getPendingAnchorResetsAt({
				customerProducts: filterCustomerProductsByStripeSubscriptionId({
					customerProducts: fullCustomer.customer_products,
					stripeSubscriptionId: pooledBalance.stripe_subscription_id,
				}),
				now,
			}),
			currentEpochMs: now,
			nextResetAt: getCycleEnd({
				anchor,
				interval: pooledBalance.interval,
				intervalCount: pooledBalance.interval_count,
				now,
			}),
		}),
		pooledBalanceId: pooledBalance.id,
		resetCycleAnchor: anchor,
	};
};

const getSyncedNextResetAt = async ({
	ctx,
	fullCustomer,
	customerEntitlement,
	now,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	customerEntitlement: CustomerEntitlementToSync;
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
		return getSyncedPooledAnchor({
			ctx,
			fullCustomer,
			customerEntitlement,
			now,
		});
	}

	const customerProductId = customerEntitlement.customer_product_id;
	if (!customerProductId) return null;

	const customerProduct = findCustomerProductById({
		fullCustomer,
		customerProductId,
	});
	if (
		!customerProduct ||
		isCustomerProductExpired(customerProduct) ||
		isCustomerProductOneOff(customerProduct)
	) {
		return null;
	}

	const anchorProduct = customerProduct.subscription_ids?.length
		? customerProduct
		: findPaidRecurringAnchorProduct({ fullCustomer, customerProduct });
	const subscriptionId = anchorProduct?.subscription_ids?.[0];
	if (!anchorProduct || !subscriptionId) {
		throw new RecaseError({
			message: "No billing anchor to sync to, please start a subscription",
			code: ErrCode.InvalidRequest,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}
	const anchor = await getStripeBillingCycleAnchor({ ctx, subscriptionId });

	return {
		nextResetAt: clampNextResetAtToPendingBillingCycleAnchor({
			billingCycleAnchorResetsAt: getPendingAnchorResetsAt({
				customerProducts: [anchorProduct],
				now,
			}),
			currentEpochMs: now,
			nextResetAt: getCycleEnd({
				anchor,
				interval: customerEntitlement.entitlement.interval ?? EntInterval.Month,
				intervalCount: customerEntitlement.entitlement.interval_count,
				now,
			}),
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
	const fullCustomerByInternalId = new Map<string, Promise<FullCustomer>>();
	const getFullCustomer = (internalCustomerId: string) => {
		const cached = fullCustomerByInternalId.get(internalCustomerId);
		if (cached) return cached;
		const fullCustomer = CusService.getFull({
			ctx,
			idOrInternalId: internalCustomerId,
			withEntities: true,
			skipReset: true,
		});
		fullCustomerByInternalId.set(internalCustomerId, fullCustomer);
		return fullCustomer;
	};
	const now = Date.now();
	const updates = (
		await Promise.all(
			customerEntitlements.map(async (customerEntitlement) => ({
				customerEntitlement,
				synced: await getSyncedNextResetAt({
					ctx,
					fullCustomer: await getFullCustomer(
						customerEntitlement.customer.internal_id,
					),
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
