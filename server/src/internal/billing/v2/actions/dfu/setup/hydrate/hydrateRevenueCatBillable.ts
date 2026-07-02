import { CusProductStatus } from "@autumn/shared";
import { getRevenueCatCli } from "@/external/revenueCat/misc/getRevenueCatCli";
import {
	getRevenueCatStoreIdentifierMap,
	mapRevenueCatProductToAutumn,
} from "@/external/revenueCat/misc/revenueCatCatalogMapper";
import type {
	RevenueCatPurchase,
	RevenueCatSubscription,
	RevenueCatSubscriptionStatus,
} from "@/external/revenueCat/revenuecatTypes";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { FlashPlanContext } from "../setupFlashContext";

/** Structurally compatible with `StripeHydration` so the same resolvers fill gaps. */
export type RevenueCatHydration = {
	status?: CusProductStatus;
	canceledAt?: number;
	endedAt?: number;
	trialEndsAt?: number;
	periodEndMs?: number;
	processorId?: string;
	startsAt?: number;
};

// Unknown/unmapped statuses fail closed to Expired so access is never leaked.
const RC_STATUS_TO_AUTUMN: Record<
	RevenueCatSubscriptionStatus,
	CusProductStatus
> = {
	active: CusProductStatus.Active,
	trialing: CusProductStatus.Active,
	expired: CusProductStatus.Expired,
	incomplete: CusProductStatus.Expired,
	in_grace_period: CusProductStatus.PastDue,
	in_billing_retry: CusProductStatus.PastDue,
	paused: CusProductStatus.Expired,
	unknown: CusProductStatus.Expired,
};

const buildSubscriptionHydration = (
	subscription: RevenueCatSubscription,
): RevenueCatHydration => {
	const status =
		RC_STATUS_TO_AUTUMN[subscription.status] ?? CusProductStatus.Expired;
	const periodEnd = subscription.current_period_ends_at ?? undefined;
	const willNotRenew = subscription.auto_renewal_status === "will_not_renew";
	const isExpired = status === CusProductStatus.Expired;
	const isTrial = subscription.status === "trialing";

	return {
		status,
		processorId: subscription.id,
		periodEndMs: periodEnd,
		// Expired ends at period-end; will_not_renew ends at the future period-end
		// (the resolver reads a future `endedAt` as canceled-till-cycle-end).
		endedAt: isExpired || willNotRenew ? periodEnd : undefined,
		trialEndsAt: isTrial ? periodEnd : undefined,
	};
};

const buildPurchaseHydration = (
	purchase: RevenueCatPurchase,
): RevenueCatHydration => ({
	processorId: purchase.id,
	startsAt: purchase.purchased_at,
});

/**
 * Read-only RevenueCat hydration: for each RC billable, read the customer's RC
 * subscriptions/purchases ONCE and stash the status/timestamp fields the caller
 * omitted. Payload always wins downstream; balances are never touched. A missing
 * `app_user_id`, null client, or fetch error is skipped so the flash falls back
 * to caller-supplied values.
 */
export const hydrateRevenueCatBillables = async ({
	ctx,
	planContexts,
	appUserId,
}: {
	ctx: AutumnContext;
	planContexts: FlashPlanContext[];
	appUserId?: string;
}): Promise<void> => {
	const rcPlanContexts = planContexts.filter(
		(planContext) => planContext.processor === "revenuecat",
	);
	if (rcPlanContexts.length === 0) return;

	const { db, org, env, logger } = ctx;
	const logExtras = (extras: Record<string, unknown>) =>
		logger.child({
			context: { extras: { dfu_flash_rc_hydrate: true, ...extras } },
		});

	if (!appUserId) {
		logExtras({ skipped: "no_app_user_id" }).info(
			"Skipping RevenueCat flash hydration: no app_user_id",
		);
		return;
	}

	const handle = await getRevenueCatCli(ctx);
	if (!handle) {
		logExtras({ skipped: "no_client" }).info(
			"Skipping RevenueCat flash hydration: no RC client",
		);
		return;
	}

	let subscriptions: RevenueCatSubscription[];
	let purchases: RevenueCatPurchase[];
	let storeIdentifierMap: Map<string, string>;
	try {
		const { cli, isMock } = handle;
		[subscriptions, purchases] = await Promise.all([
			cli.listCustomerSubscriptions(appUserId),
			cli.listCustomerPurchases(appUserId),
		]);
		// Rebuild in mock mode so concurrent tests never share a stale catalog.
		storeIdentifierMap = await getRevenueCatStoreIdentifierMap({
			rcCli: cli,
			orgId: org.id,
			env,
			logger,
			forceRefresh: isMock,
		});
	} catch (error) {
		logExtras({
			skipped: "fetch_error",
			error: error instanceof Error ? error.message : String(error),
		}).warn(
			"RevenueCat flash hydration read failed; using caller-supplied fields",
		);
		return;
	}

	logExtras({
		app_user_id: appUserId,
		subscription_count: subscriptions.length,
		purchase_count: purchases.length,
	}).info("Fetched RevenueCat subscriptions/purchases for flash hydration");

	const matchesPlan = async (
		revenueCatInternalProductId: string | null,
		planId: string,
	): Promise<boolean> => {
		if (!revenueCatInternalProductId) return false;
		const autumnProductId = await mapRevenueCatProductToAutumn({
			db,
			orgId: org.id,
			env,
			revenueCatInternalProductId,
			storeIdentifierMap,
			logger,
		});
		return autumnProductId === planId;
	};

	for (const planContext of rcPlanContexts) {
		const planId = planContext.fullProduct.id;

		let matchedSubscription: RevenueCatSubscription | undefined;
		for (const subscription of subscriptions) {
			if (await matchesPlan(subscription.product_id, planId)) {
				matchedSubscription = subscription;
				break;
			}
		}

		if (matchedSubscription) {
			planContext.revenueCatHydration =
				buildSubscriptionHydration(matchedSubscription);
			logExtras({
				plan_id: planId,
				matched: "subscription",
				matched_id: matchedSubscription.id,
				rc_status: matchedSubscription.status,
				auto_renewal_status: matchedSubscription.auto_renewal_status,
				inferred_status: planContext.revenueCatHydration.status,
			}).info("Hydrated RevenueCat flash billable from subscription");
			continue;
		}

		let matchedPurchase: RevenueCatPurchase | undefined;
		for (const purchase of purchases) {
			if (await matchesPlan(purchase.product_id, planId)) {
				matchedPurchase = purchase;
				break;
			}
		}

		if (matchedPurchase) {
			planContext.revenueCatHydration = buildPurchaseHydration(matchedPurchase);
			logExtras({
				plan_id: planId,
				matched: "purchase",
				matched_id: matchedPurchase.id,
			}).info("Hydrated RevenueCat flash billable from one-off purchase");
			continue;
		}

		logExtras({ plan_id: planId, matched: "none" }).info(
			"No matching RevenueCat item for flash billable; using caller-supplied fields",
		);
	}
};
