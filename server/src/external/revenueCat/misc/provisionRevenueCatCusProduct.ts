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
import {
	type RevenueCatPeriodEvent,
	storeRevenueCatPeriod,
} from "@/external/revenueCat/utils/revenueCatPeriod";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { attach } from "@/internal/billing/v2/actions/attach/attach";
import { invalidateCachedFullSubject } from "@/internal/customers/cache/fullSubject/actions/invalidate/invalidateFullSubject";
import { customerProductRepo } from "@/internal/customers/cusProducts/repos";

type MatchedRcItem = { id: string; active: boolean; timestamp: number };

const subscriptionGivesAccess = (sub: RevenueCatSubscription): boolean =>
	sub.gives_access === true ||
	sub.status === "active" ||
	sub.status === "trialing";

export const storeRevenueCatProcessorId = async ({
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

		await customerProductRepo.mergeProcessor({
			db,
			cusProductId: cusProduct.id,
			processor: { type: ProcessorType.RevenueCat, id: matchedId },
		});
		await invalidateCachedFullSubject({
			ctx,
			customerId: cusProduct.customer_id ?? "",
			source: "storeRevenueCatProcessorId",
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

export const provisionRevenueCatCusProduct = async ({
	ctx,
	customer,
	product,
	revenuecatMetadata,
	featureQuantities,
	appUserId,
	periodEvent,
	originalTransactionId,
}: {
	ctx: AutumnContext;
	customer: FullCustomer;
	product: FullProduct;
	revenuecatMetadata?: Record<string, string>;
	featureQuantities?: Array<{ feature_id: string; quantity?: number }>;
	appUserId?: string;
	periodEvent?: RevenueCatPeriodEvent;
	originalTransactionId?: string | null;
}): Promise<{ cusProduct: FullCusProduct; product: FullProduct }> => {
	const { db, org, env } = ctx;

	const contextOverride: BillingContextOverride = {
		fullCustomer: customer,
		productContext: { fullProduct: product },
		skipBillingFetching: true,
		skipExternalPSPGuard: true,
		processorTypeOverride: ProcessorType.RevenueCat,
		...(originalTransactionId
			? {
					processorOverride: {
						type: ProcessorType.RevenueCat,
						original_transaction_id: originalTransactionId,
					},
				}
			: {}),
	};

	await attach({
		ctx,
		params: {
			customer_id: customer.id || customer.internal_id,
			plan_id: product.id,
			redirect_mode: "if_required",
			no_billing_changes: true,
			enable_plan_immediately: true,
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

	if (periodEvent) {
		await storeRevenueCatPeriod({
			ctx,
			customerProduct: cusProduct,
			event: periodEvent,
		});
	}

	void storeRevenueCatProcessorId({
		ctx,
		cusProduct,
		product,
		appUserId,
	}).catch((error) => {
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
	});

	return { cusProduct, product };
};
