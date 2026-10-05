import type { WebhookTransfer } from "@puzzmo/revenue-cat-webhook-types";
import type { FullCusProduct, FullCustomer } from "@shared/index";
import { getRevenueCatOverrideCustomerId } from "@/external/revenueCat/misc/getRevenueCatOverrideCustomerId";
import { resolveRevenueCatCustomer } from "@/external/revenueCat/misc/resolveRevenuecatResources";
import { expireSupersededCusProducts } from "@/external/revenueCat/transfer/expireSupersededCusProducts";
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
	const { logger } = ctx;
	const { transferred_from, transferred_to } = event;
	const skip = (reason: string) => {
		logger.info(`[handleTransfer] no-op: ${reason}`);
		return { success: true };
	};

	const sources = await findSourceCustomers({
		ctx,
		appUserIds: transferred_from ?? [],
	});
	if (sources.length === 0) return skip("source customer not found");

	const destinationItems = await listDestinationRevenueCatProducts({
		ctx,
		appUserIds: transferred_to ?? [],
	});
	if (!destinationItems) return skip("no RevenueCat client configured");

	const transferringBySource = sources
		.map((source) => ({
			source,
			cusProducts: selectTransferredCusProducts({
				sourceCusProducts: source.customer_products,
				destination: destinationItems,
			}),
		}))
		.filter(({ cusProducts }) => cusProducts.length > 0);
	if (transferringBySource.length === 0)
		return skip("destination holds none of the source's RevenueCat products");

	const [firstTo, ...otherTo] = transferred_to;
	const destination = await resolveRevenueCatCustomer({
		ctx,
		appUserId: firstTo,
		originalAppUserId: otherTo[0],
		overrideCustomerId: getRevenueCatOverrideCustomerId(event),
		autoCreateCustomer: true,
	});
	ctx.customerId = destination.id ?? "";

	for (const { source, cusProducts } of transferringBySource) {
		if (source.internal_id === destination.internal_id) continue;
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
	const { logger } = ctx;
	const destination = await loadCustomerWithAllProducts({
		ctx,
		internalId: destinationInternalId,
	});
	const movable: FullCusProduct[] = [];
	const replacedOnDestination = new Set<string>();

	for (const cusProduct of cusProducts) {
		if (hasPooledBalanceDependency(cusProduct)) {
			logger.warn(
				`[handleTransfer] skipping ${cusProduct.id}: pooled balance dependency`,
			);
			continue;
		}
		const { curMainProduct, curSameProduct } = getExistingCusProducts({
			product: cusProduct.product,
			cusProducts: destination.customer_products,
		});
		if (curSameProduct) {
			logger.info(
				`[handleTransfer] destination already has ${cusProduct.product.id}, leaving ${cusProduct.id}`,
			);
			continue;
		}
		if (curMainProduct && !cusProduct.product.is_add_on)
			replacedOnDestination.add(curMainProduct.id);
		movable.push(cusProduct);
	}
	if (movable.length === 0) return;

	const cusProductIds = movable.map((cusProduct) => cusProduct.id);

	await invalidateCachedFullSubject({
		ctx,
		customerId: publicId(source),
		source: "handleRevenuecatTransfer:flush",
		flushBalances: true,
	});
	await releaseTransferredLicenseSeats({ ctx, source, cusProductIds });
	await expireSupersededCusProducts({
		ctx,
		customerId: publicId(destination),
		cusProducts: destination.customer_products.filter((cusProduct) =>
			replacedOnDestination.has(cusProduct.id),
		),
	});
	await moveCusProductsToCustomer({
		db: ctx.db,
		cusProductIds,
		destination: { internalId: destination.internal_id, id: destination.id },
	});

	try {
		await restoreSourceDefaults({ ctx, source, moved: movable });
	} finally {
		await refreshCustomer({ ctx, customer: destination });
		await refreshCustomer({ ctx, customer: source });
	}

	logger.info(
		`[handleTransfer] moved ${cusProductIds.length} product(s) ${publicId(source)} -> ${publicId(destination)}`,
	);
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
