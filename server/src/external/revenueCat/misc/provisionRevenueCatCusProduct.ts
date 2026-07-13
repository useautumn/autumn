import {
	type BillingContextOverride,
	ErrCode,
	type FullCusProduct,
	type FullCustomer,
	type FullProduct,
	ProcessorType,
	RecaseError,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import { getRevenueCatCli } from "@/external/revenueCat/misc/getRevenueCatCli";
import {
	getRevenueCatStoreIdentifierMap,
	mapRevenueCatProductToAutumn,
} from "@/external/revenueCat/misc/revenueCatCatalogMapper";
import type {
	RevenueCatPurchase,
	RevenueCatSubscription,
} from "@/external/revenueCat/revenuecatTypes";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { attach } from "@/internal/billing/v2/actions/attach/attach";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { customerProductRepo } from "@/internal/customers/cusProducts/repos";

type MatchedRcItem = { id: string; active: boolean; timestamp: number };

const subscriptionGivesAccess = (sub: RevenueCatSubscription): boolean =>
	sub.gives_access === true ||
	sub.status === "active" ||
	sub.status === "trialing";

/**
 * Best-effort: resolve the RC subscription/purchase that provisioned this
 * cus_product and store its id on `cusProduct.processor.id`. NEVER throws or
 * slows the insert — on any error/no-match the product stays inserted without
 * the id. Logs the outcome under `rc_id_fetch`.
 */
const storeRevenueCatProcessorId = async ({
	ctx,
	cusProduct,
	product,
	appUserId,
}: {
	ctx: AutumnContext;
	cusProduct: FullCusProduct;
	product: FullProduct;
	appUserId?: string;
}): Promise<void> => {
	const { db, org, env, logger } = ctx;
	const logExtras = (extras: Record<string, unknown>) =>
		logger.child({ context: { extras: { rc_id_fetch: true, ...extras } } });

	if (!appUserId) {
		logExtras({ attempted: false, skipped: "no_app_user_id" }).info(
			"Skipping RevenueCat processor id store: no app_user_id",
		);
		return;
	}

	const handle = await getRevenueCatCli(ctx);
	if (!handle) {
		logExtras({ attempted: false, skipped: "no_client" }).info(
			"Skipping RevenueCat processor id store: no RC client",
		);
		return;
	}

	try {
		const { cli, isMock } = handle;
		const [subscriptions, purchases] = await Promise.all([
			cli.listCustomerSubscriptions(appUserId),
			cli.listCustomerPurchases(appUserId),
		]);

		// Build fresh in mock mode so concurrent tests don't share a stale catalog.
		const storeIdentifierMap = await getRevenueCatStoreIdentifierMap({
			rcCli: cli,
			orgId: org.id,
			env,
			logger,
			forceRefresh: isMock,
		});

		const matchesProduct = async (
			revenueCatInternalProductId: string | null,
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
			return autumnProductId === product.id;
		};

		const candidates: MatchedRcItem[] = [];
		for (const sub of subscriptions) {
			if (await matchesProduct(sub.product_id)) {
				candidates.push({
					id: sub.id,
					active: subscriptionGivesAccess(sub),
					timestamp: sub.starts_at,
				});
			}
		}
		for (const purchase of purchases as RevenueCatPurchase[]) {
			if (await matchesProduct(purchase.product_id)) {
				candidates.push({
					id: purchase.id,
					active: purchase.status !== "refunded",
					timestamp: purchase.purchased_at,
				});
			}
		}

		// Prefer active, then most recent.
		candidates.sort((a, b) =>
			a.active !== b.active
				? Number(b.active) - Number(a.active)
				: b.timestamp - a.timestamp,
		);
		const matchedId = candidates[0]?.id ?? null;

		if (!matchedId) {
			logExtras({
				attempted: true,
				stored: false,
				matched_id: null,
				subscription_count: subscriptions.length,
				purchase_count: purchases.length,
			}).info("No matching RevenueCat item for provisioned product");
			return;
		}

		await CusProductService.update({
			ctx,
			cusProductId: cusProduct.id,
			updates: {
				processor: { type: ProcessorType.RevenueCat, id: matchedId },
			},
		});

		logExtras({
			attempted: true,
			stored: true,
			matched_id: matchedId,
			candidate_count: candidates.length,
		}).info("Stored RevenueCat processor id on cus_product");
	} catch (error) {
		logExtras({
			attempted: true,
			stored: false,
			error: error instanceof Error ? error.message : String(error),
		}).error("Failed to store RevenueCat processor id (best-effort)");
	}
};

/**
 * Provisions a RevenueCat customer product via V2 attach.
 *
 * RC payments happen on App Store / Play Store / etc., so Autumn never reads
 * or writes Stripe state for these flows. We funnel through V2 `attach()` so
 * the new cus_product, entitlements, prices, line items, webhooks, and rollover
 * carry-overs all run through the same pipeline as Stripe/Vercel, just with
 * the Stripe and external-PSP guards disabled.
 *
 * Handles new / upgrade / downgrade scenarios via `computeAttachPlan`'s
 * transition logic — the caller does not need to expire the outgoing
 * cus_product manually. Transitions are forced immediate (`plan_schedule`)
 * since RC is the payment source-of-truth; we don't schedule downgrades
 * end-of-cycle the way a Stripe-billed attach would.
 */
export const provisionRevenueCatCusProduct = async ({
	ctx,
	customer,
	product,
	revenuecatMetadata,
	featureQuantities,
	appUserId,
}: {
	ctx: AutumnContext;
	customer: FullCustomer;
	product: FullProduct;
	revenuecatMetadata?: Record<string, string>;
	featureQuantities?: Array<{ feature_id: string; quantity?: number }>;
	appUserId?: string;
}): Promise<{ cusProduct: FullCusProduct; product: FullProduct }> => {
	const { db, org, env } = ctx;

	// `resolveRevenuecatResources` loads `customer` with `withEntities: true`, which
	// is what `setupFullCustomerContext` would do anyway. Passing it as an override
	// skips a redundant DB fetch.
	const contextOverride: BillingContextOverride = {
		fullCustomer: customer,
		productContext: { fullProduct: product },
		skipBillingFetching: true,
		skipExternalPSPGuard: true,
		processorTypeOverride: ProcessorType.RevenueCat,
	};

	await attach({
		ctx,
		params: {
			customer_id: customer.id || customer.internal_id,
			plan_id: product.id,
			redirect_mode: "if_required",
			no_billing_changes: true,
			enable_plan_immediately: true,
			// RC payments are source-of-truth: apply product changes now rather
			// than scheduling downgrades end-of-cycle like Stripe-style attaches.
			plan_schedule: "immediate",
			...(revenuecatMetadata ? { metadata: revenuecatMetadata } : {}),
			...(featureQuantities?.length
				? { feature_quantities: featureQuantities }
				: {}),
		},
		contextOverride,
		skipAutumnCheckout: true,
	});

	const cusProducts = await customerProductRepo.getByCustomerAndProduct({
		db,
		internalCustomerId: customer.internal_id,
		internalProductId: product.internal_id,
		orgId: org.id,
		env,
		inStatuses: ["active", "trialing", "scheduled"],
	});

	const cusProduct = cusProducts.find(
		(cp) => cp.processor?.type === ProcessorType.RevenueCat,
	);

	if (!cusProduct) {
		throw new RecaseError({
			message:
				"Failed to find newly-provisioned RevenueCat customer product after attach",
			code: ErrCode.CusProductNotFound,
			statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
		});
	}

	// Fire-and-forget: must not block or slow the webhook response. The function
	// self-logs every outcome; the outer catch guards the pre-try client await.
	void storeRevenueCatProcessorId({ ctx, cusProduct, product, appUserId }).catch(
		(error) => {
			ctx.logger
				.child({
					context: {
						extras: {
							rc_id_fetch: true,
							stored: false,
							error: error instanceof Error ? error.message : String(error),
						},
					},
				})
				.error("RevenueCat processor id store rejected (best-effort)");
		},
	);

	return { cusProduct, product };
};
