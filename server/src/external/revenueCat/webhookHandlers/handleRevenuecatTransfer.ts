import type { WebhookTransfer } from "@puzzmo/revenue-cat-webhook-types";
import type { FullCusProduct, FullCustomer } from "@shared/index";
import { getCtxWithCustomerRedis } from "@/external/redis/customerRedisRouting";
import { getRevenueCatOverrideCustomerId } from "@/external/revenueCat/misc/getRevenueCatOverrideCustomerId";
import { setRevenueCatLogContext } from "@/external/revenueCat/misc/revenueCatLogContext";
import { expireSupersededCusProducts } from "@/external/revenueCat/transfer/expireSupersededCusProducts";
import { findDestinationCustomer } from "@/external/revenueCat/transfer/findDestinationCustomer";
import { findSourceCustomers } from "@/external/revenueCat/transfer/findSourceCustomers";
import { hasPooledBalanceDependency } from "@/external/revenueCat/transfer/hasPooledBalanceDependency";
import { listDestinationRevenueCatProducts } from "@/external/revenueCat/transfer/listDestinationRevenueCatProducts";
import { loadCustomerWithAllProducts } from "@/external/revenueCat/transfer/loadCustomerWithAllProducts";
import { moveCusProductsToCustomer } from "@/external/revenueCat/transfer/moveCusProductsToCustomer";
import { releaseTransferredLicenseSeats } from "@/external/revenueCat/transfer/releaseTransferredLicenseSeats";
import { selectTransferredCusProducts } from "@/external/revenueCat/transfer/selectTransferredCusProducts";
import type { RevenueCatWebhookContext } from "@/external/revenueCat/webhookMiddlewares/revenuecatWebhookContext";
import { refreshAllocationScale } from "@/internal/balances/allocate/actions/refreshAllocationScale";
import { invalidateCachedFullSubject } from "@/internal/customers/cache/fullSubject/actions/invalidate/invalidateFullSubject";
import { activateFreeDefaultProduct } from "@/internal/customers/cusProducts/actions/activateFreeDefaultProduct";
import { getExistingCusProducts } from "@/internal/customers/cusProducts/cusProductUtils/getExistingCusProducts";
import { reconcileLicenseStateForCustomer } from "@/internal/licenses/actions/reconcile/reconcileLicenseState";

const publicId = (customer: FullCustomer) =>
	customer.id ?? customer.internal_id;

/** Routes Redis for this customer and tags its logs, so source and destination work never share one customer's context. */
const ctxForCustomer = ({
	ctx,
	customer,
}: {
	ctx: RevenueCatWebhookContext;
	customer: FullCustomer;
}) => {
	const { ctx: customerCtx } = getCtxWithCustomerRedis({
		ctx,
		customerId: publicId(customer),
	});
	setRevenueCatLogContext({ ctx: customerCtx, customerId: publicId(customer) });
	return customerCtx;
};

const logTransfer = ({
	ctx,
	message,
	extras,
	level = "info",
}: {
	ctx: RevenueCatWebhookContext;
	message: string;
	extras: Record<string, unknown>;
	level?: "info" | "warn";
}) =>
	ctx.logger
		.child({ context: { extras: { rc_transfer: true, ...extras } } })
		[level](`[handleTransfer] ${message}`);

const refreshCustomer = async ({
	ctx,
	customer,
}: {
	ctx: RevenueCatWebhookContext;
	customer: FullCustomer;
}) => {
	await invalidateCachedFullSubject({
		ctx,
		customerId: publicId(customer),
		source: "handleRevenuecatTransfer",
	});
	await reconcileLicenseStateForCustomer({
		ctx,
		idOrInternalId: customer.internal_id,
		deleteCache: true,
	});
	await refreshAllocationScale({
		ctx,
		customerId: publicId(customer),
		flushBalances: false,
	}).catch((error) =>
		ctx.logger.error("[handleRevenuecatTransfer] allocation refresh failed", {
			error,
		}),
	);
};

/** Moves the products RevenueCat now reports on the destination; always acknowledges anything not worth a retry. */
export const handleTransfer = async ({
	event,
	ctx,
}: {
	event: WebhookTransfer & {
		subscriber_attributes?: Record<string, { value: string } | undefined>;
	};
	ctx: RevenueCatWebhookContext;
}) => {
	const { transferred_from, transferred_to } = event;
	const skip = ({
		reason,
		extras = {},
	}: {
		reason: string;
		extras?: Record<string, unknown>;
	}) => {
		logTransfer({
			ctx,
			message: `no-op: ${reason}`,
			extras: { outcome: "noop", reason, ...extras },
		});
		return { success: true };
	};

	const sources = await findSourceCustomers({
		ctx,
		appUserIds: transferred_from ?? [],
	});
	if (sources.length === 0)
		return skip({ reason: "source customer not found" });

	const destinationItems = await listDestinationRevenueCatProducts({
		ctx,
		appUserIds: transferred_to ?? [],
	});
	if (!destinationItems)
		return skip({ reason: "no RevenueCat client configured" });

	const transferringBySource = sources
		.map((source) => ({
			source,
			cusProducts: selectTransferredCusProducts({
				sourceCusProducts: source.customer_products,
				destination: destinationItems,
			}),
		}))
		.filter(({ cusProducts }) => cusProducts.length > 0);

	const sourceSummary = sources.map((source) => ({
		customer_id: publicId(source),
		rc_products: source.customer_products
			.filter((cusProduct) => cusProduct.processor?.type === "revenuecat")
			.map((cusProduct) => ({
				cus_product_id: cusProduct.id,
				product_id: cusProduct.product.id,
				status: cusProduct.status,
				rc_item_id: cusProduct.processor?.id ?? null,
			})),
	}));
	const destinationSummary = {
		rc_item_ids: [...destinationItems.rcItemIds],
		autumn_product_ids: [...destinationItems.autumnProductIds],
	};

	if (transferringBySource.length === 0)
		return skip({
			reason: "destination holds none of the source's RevenueCat products",
			extras: {
				sources: sourceSummary,
				destination_holdings: destinationSummary,
			},
		});

	const destination = await findDestinationCustomer({
		ctx,
		appUserIds: transferred_to,
		overrideCustomerId: getRevenueCatOverrideCustomerId(event),
	});
	ctx.customerId = destination.id ?? "";
	setRevenueCatLogContext({ ctx, customerId: ctx.customerId });

	logTransfer({
		ctx,
		message: "resolved",
		extras: {
			destination_customer_id: publicId(destination),
			sources: sourceSummary,
			destination_holdings: destinationSummary,
			selected: transferringBySource.map(({ source, cusProducts }) => ({
				source_customer_id: publicId(source),
				cus_product_ids: cusProducts.map((cusProduct) => cusProduct.id),
			})),
		},
	});

	for (const { source, cusProducts } of transferringBySource) {
		if (source.internal_id === destination.internal_id) {
			logTransfer({
				ctx,
				message: "no-op: source and destination are the same customer",
				extras: { outcome: "noop", source_customer_id: publicId(source) },
			});
			continue;
		}
		await transferProducts({
			ctx,
			source,
			destinationInternalId: destination.internal_id,
			cusProducts,
		});
	}
	return { success: true };
};

const transferProducts = async ({
	ctx,
	source,
	destinationInternalId,
	cusProducts,
}: {
	ctx: RevenueCatWebhookContext;
	source: FullCustomer;
	destinationInternalId: string;
	cusProducts: FullCusProduct[];
}) => {
	const destination = await loadCustomerWithAllProducts({
		ctx,
		internalId: destinationInternalId,
	});
	const sourceCtx = ctxForCustomer({ ctx, customer: source });
	const destinationCtx = ctxForCustomer({ ctx, customer: destination });
	const transferExtras = {
		source_customer_id: publicId(source),
		destination_customer_id: publicId(destination),
	};

	const movable: FullCusProduct[] = [];
	const replacedOnDestination: FullCusProduct[] = [];
	const skipped: Array<{ cus_product_id: string; reason: string }> = [];

	for (const cusProduct of cusProducts) {
		if (hasPooledBalanceDependency(cusProduct)) {
			skipped.push({ cus_product_id: cusProduct.id, reason: "pooled_balance" });
			continue;
		}
		const { curMainProduct, curSameProduct } = getExistingCusProducts({
			product: cusProduct.product,
			cusProducts: destination.customer_products,
		});
		if (curSameProduct) {
			skipped.push({
				cus_product_id: cusProduct.id,
				reason: "destination_has_same_plan",
			});
			continue;
		}
		if (
			curMainProduct &&
			!cusProduct.product.is_add_on &&
			!replacedOnDestination.some(({ id }) => id === curMainProduct.id)
		)
			replacedOnDestination.push(curMainProduct);
		movable.push(cusProduct);
	}

	if (skipped.length > 0)
		logTransfer({
			ctx,
			level: "warn",
			message: `skipped ${skipped.length} product(s)`,
			extras: { ...transferExtras, skipped },
		});
	if (movable.length === 0) return;

	const cusProductIds = movable.map((cusProduct) => cusProduct.id);

	await invalidateCachedFullSubject({
		ctx: sourceCtx,
		customerId: publicId(source),
		source: "handleRevenuecatTransfer:flush",
		flushBalances: true,
	});
	await releaseTransferredLicenseSeats({
		ctx: sourceCtx,
		source,
		cusProductIds,
	});
	await expireSupersededCusProducts({
		ctx: destinationCtx,
		customerId: publicId(destination),
		cusProducts: replacedOnDestination,
	});
	await moveCusProductsToCustomer({
		db: ctx.db,
		cusProductIds,
		destination: { internalId: destination.internal_id, id: destination.id },
	});

	logTransfer({
		ctx,
		message: `moved ${cusProductIds.length} product(s) ${publicId(source)} -> ${publicId(destination)}`,
		extras: {
			...transferExtras,
			outcome: "moved",
			moved: movable.map((cusProduct) => ({
				cus_product_id: cusProduct.id,
				product_id: cusProduct.product.id,
				rc_item_id: cusProduct.processor?.id ?? null,
			})),
			replaced_on_destination: replacedOnDestination.map(
				(cusProduct) => cusProduct.id,
			),
		},
	});

	try {
		await restoreSourceDefaults({ ctx: sourceCtx, source, moved: movable });
	} finally {
		await refreshCustomer({ ctx: destinationCtx, customer: destination });
		await refreshCustomer({ ctx: sourceCtx, customer: source });
	}
};

const restoreSourceDefaults = async ({
	ctx,
	source,
	moved,
}: {
	ctx: RevenueCatWebhookContext;
	source: FullCustomer;
	moved: FullCusProduct[];
}) => {
	const refreshedSource = await loadCustomerWithAllProducts({
		ctx,
		internalId: source.internal_id,
	});
	for (const cusProduct of moved) {
		const { curMainProduct } = getExistingCusProducts({
			product: cusProduct.product,
			cusProducts: refreshedSource.customer_products,
		});
		if (curMainProduct) continue;
		await activateFreeDefaultProduct({
			ctx,
			customerProduct: cusProduct,
			fullCustomer: refreshedSource,
		});
	}
};
