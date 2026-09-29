import {
	EntInterval,
	getCycleEnd,
	isBooleanEntitlement,
	isCustomerProductExpired,
	isCustomerProductOneOff,
	isLifetimeEntitlement,
	secondsToMs,
} from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer";
import { ACTIVE_STATUSES, CusProductService } from "../../CusProductService";
import { CusEntService } from "../CusEntitlementService";

/** Soonest upcoming reset across the customer's other active products, used as
 * the anchor when the product has no Stripe subscription to align to. */
const getSoonestFutureResetAt = async ({
	ctx,
	internalCustomerId,
	excludeCustomerProductId,
	now,
}: {
	ctx: AutumnContext;
	internalCustomerId: string;
	excludeCustomerProductId: string;
	now: number;
}): Promise<number | null> => {
	const customerProducts = await CusProductService.list({
		db: ctx.db,
		internalCustomerId,
		inStatuses: ACTIVE_STATUSES,
	});

	let soonestResetAt: number | null = null;
	for (const customerProduct of customerProducts) {
		if (customerProduct.id === excludeCustomerProductId) continue;
		for (const customerEntitlement of customerProduct.customer_entitlements) {
			const nextResetAt = customerEntitlement.next_reset_at;
			if (nextResetAt == null || nextResetAt <= now) continue;
			if (soonestResetAt == null || nextResetAt < soonestResetAt) {
				soonestResetAt = nextResetAt;
			}
		}
	}

	return soonestResetAt;
};

const getSyncedNextResetAt = async ({
	ctx,
	customerEntitlement,
	now,
}: {
	ctx: AutumnContext;
	customerEntitlement: Awaited<ReturnType<typeof CusEntService.getStrict>>;
	now: number;
}): Promise<number | null> => {
	if (
		(customerEntitlement.expires_at != null &&
			customerEntitlement.expires_at <= now) ||
		isBooleanEntitlement({ entitlement: customerEntitlement.entitlement }) ||
		isLifetimeEntitlement({ entitlement: customerEntitlement.entitlement })
	) {
		return null;
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
		const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
		const subscription = await stripeCli.subscriptions.retrieve(subscriptionId);
		anchor = secondsToMs(subscription.billing_cycle_anchor);
	} else {
		const soonestFutureResetAt = await getSoonestFutureResetAt({
			ctx,
			internalCustomerId: customerProduct.internal_customer_id,
			excludeCustomerProductId: customerProduct.id,
			now,
		});
		anchor = soonestFutureResetAt ?? anchor;
	}
	if (anchor == null) return null;

	return getCycleEnd({
		anchor,
		interval: customerEntitlement.entitlement.interval ?? EntInterval.Month,
		intervalCount: customerEntitlement.entitlement.interval_count,
		now,
	});
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
				nextResetAt: await getSyncedNextResetAt({
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
			nextResetAt: number;
		} => update.nextResetAt != null,
	);
	if (updates.length === 0) {
		return { updated: 0, skipped: uniqueIds.length };
	}

	await ctx.db.transaction(async (tx) => {
		const txCtx = { ...ctx, db: tx as unknown as typeof ctx.db };
		await Promise.all(
			updates.map(({ customerEntitlement, nextResetAt }) =>
				CusEntService.update({
					ctx: txCtx,
					id: customerEntitlement.id,
					updates: { next_reset_at: nextResetAt },
					incrementCacheVersion: true,
				}),
			),
		);
	});

	const customerIds = new Set(
		updates.map(
			({ customerEntitlement }) =>
				customerEntitlement.customer.id ??
				customerEntitlement.customer.internal_id,
		),
	);
	await Promise.all(
		[...customerIds].map((customerId) =>
			deleteCachedFullCustomer({
				ctx,
				customerId,
				source: "syncCustomerEntitlementAnchors",
			}),
		),
	);

	return {
		updated: updates.length,
		skipped: uniqueIds.length - updates.length,
	};
};
