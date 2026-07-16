import {
	CusProductStatus,
	type FullCusProduct,
	filterCustomerProductsByStripeSubscriptionId,
} from "@autumn/shared";
import type Stripe from "stripe";
import { billingActions } from "@/internal/billing/v2/actions";
import { canAutoSync } from "@/internal/billing/v2/actions/sync/canAutoSync/index.js";
import { buildIncrementalSyncParams } from "@/internal/billing/v2/actions/sync/scope/buildIncrementalSyncParams.js";
import { subscriptionToSyncParams } from "@/internal/billing/v2/actions/sync/subscriptionToSyncParams";
import type { SyncV2Result } from "@/internal/billing/v2/actions/sync/syncV2";
import { isAutumnManagedSubscriptionMetadata } from "@/internal/billing/v2/providers/stripe/utils/common/autumnStripeMetadata";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import type { StripeWebhookContext } from "../../../webhookMiddlewares/stripeWebhookContext";
import {
	trackCustomerProductInsertion,
	trackCustomerProductUpdate,
} from "../../common/trackCustomerProductUpdate";
import type { StripeSubscriptionUpdatedContext } from "../stripeSubscriptionUpdatedContext";

const stripeProductId = (
	product: string | Stripe.Product | Stripe.DeletedProduct,
) => (typeof product === "string" ? product : product.id);

const priceOrProductChanged = ({
	subscriptionUpdatedContext,
}: {
	subscriptionUpdatedContext: StripeSubscriptionUpdatedContext;
}) => {
	const { stripeSubscription, previousAttributes } = subscriptionUpdatedContext;
	if (!previousAttributes.items?.data.length) return false;

	const currentItems = new Map(
		stripeSubscription.items.data.map((item) => [item.id, item]),
	);
	if (currentItems.size !== previousAttributes.items.data.length) return true;

	return previousAttributes.items.data.some((previousItem) => {
		const currentItem = currentItems.get(previousItem.id);
		if (!currentItem) return true;

		return (
			currentItem.price.id !== previousItem.price.id ||
			stripeProductId(currentItem.price.product) !==
				stripeProductId(previousItem.price.product) ||
			// Quantity-only changes matter too (e.g. prepaid add-on packs).
			(currentItem.quantity ?? 1) !== (previousItem.quantity ?? 1)
		);
	});
};

const trackSyncResult = async ({
	ctx,
	subscriptionUpdatedContext,
	result,
	linkedCustomerProducts,
}: {
	ctx: StripeWebhookContext;
	subscriptionUpdatedContext: StripeSubscriptionUpdatedContext;
	result: SyncV2Result;
	linkedCustomerProducts: FullCusProduct[];
}) => {
	const { customerProducts, fullCustomer } = subscriptionUpdatedContext;

	for (const id of result.expired_cus_product_ids) {
		const customerProduct =
			customerProducts.find((cp) => cp.id === id) ??
			linkedCustomerProducts.find((cp) => cp.id === id);
		const syncedProduct = await CusProductService.getFull({ db: ctx.db, id });
		if (!customerProduct || !syncedProduct) continue;

		trackCustomerProductUpdate({
			eventContext: subscriptionUpdatedContext,
			customerProduct,
			updates: {
				status: syncedProduct.status,
				canceled: syncedProduct.canceled,
				canceled_at: syncedProduct.canceled_at,
				ended_at: syncedProduct.ended_at,
			},
		});
	}

	for (const id of result.inserted_cus_product_ids) {
		const customerProduct = await CusProductService.getFull({ db: ctx.db, id });
		if (!customerProduct) continue;

		if (!fullCustomer.customer_products.some((cp) => cp.id === id)) {
			fullCustomer.customer_products.push(customerProduct);
		}

		trackCustomerProductInsertion({
			eventContext: subscriptionUpdatedContext,
			customerProduct,
		});
	}
};

const expireRemovedCustomerProducts = async ({
	ctx,
	subscriptionUpdatedContext,
	removedCustomerProducts,
}: {
	ctx: StripeWebhookContext;
	subscriptionUpdatedContext: StripeSubscriptionUpdatedContext;
	removedCustomerProducts: FullCusProduct[];
}) => {
	const nowMs = Date.now();
	for (const customerProduct of removedCustomerProducts) {
		const updates = {
			status: CusProductStatus.Expired,
			ended_at: nowMs,
			canceled: true,
			canceled_at: nowMs,
		};
		await CusProductService.update({
			ctx,
			cusProductId: customerProduct.id,
			updates,
		});
		trackCustomerProductUpdate({
			eventContext: subscriptionUpdatedContext,
			customerProduct,
			updates,
		});
	}
};

export const autoSyncUpdatedSubscription = async ({
	ctx,
	subscriptionUpdatedContext,
}: {
	ctx: StripeWebhookContext;
	subscriptionUpdatedContext: StripeSubscriptionUpdatedContext;
}) => {
	const { logger } = ctx;
	const { stripeSubscription, fullCustomer, customerProducts } =
		subscriptionUpdatedContext;

	if (!priceOrProductChanged({ subscriptionUpdatedContext })) return;
	const metadataDecision = isAutumnManagedSubscriptionMetadata({
		metadata: stripeSubscription.metadata,
		requireRecent: true,
		ignoreManagedSource: true,
	});
	if (metadataDecision.skip) {
		logger.info(
			`sub.updated auto-sync skipping ${stripeSubscription.id}: ${metadataDecision.reason}`,
		);
		return;
	}

	const linkedCustomerProducts = filterCustomerProductsByStripeSubscriptionId({
		customerProducts,
		stripeSubscriptionId: stripeSubscription.id,
	});
	if (linkedCustomerProducts.length === 0) {
		logger.info(
			`sub.updated auto-sync skipping ${stripeSubscription.id}: expected linked products, found 0`,
		);
		return;
	}

	const customerId = fullCustomer.id ?? fullCustomer.internal_id;
	const { match, params } = await subscriptionToSyncParams({
		ctx,
		customerId,
		subscription: stripeSubscription,
		customerProducts,
	});

	const eligibility = canAutoSync({ match });
	if (!eligibility.eligible) {
		logger.info(
			`sub.updated auto-sync skipping ${stripeSubscription.id}: ${eligibility.reason} - ${eligibility.details}`,
		);
		return;
	}

	const incremental = buildIncrementalSyncParams({
		match,
		params,
		linkedCustomerProducts,
	});
	if (!incremental.shouldSync) {
		logger.info(
			`sub.updated auto-sync skipping ${stripeSubscription.id}: ${incremental.reason}`,
		);
		return;
	}

	await billingActions.syncLicenseQuantities({
		ctx,
		params: {
			customerId,
			licenseQuantityDrifts: incremental.licenseQuantityDrifts,
		},
	});

	await expireRemovedCustomerProducts({
		ctx,
		subscriptionUpdatedContext,
		removedCustomerProducts: incremental.removedCustomerProducts,
	});

	if (!incremental.params) {
		logger.info(
			`sub.updated auto-sync applied ${stripeSubscription.id}: removed=${incremental.removedCustomerProducts.length}, licensePools=${incremental.licenseQuantityDrifts.length}`,
		);
		return;
	}

	const result = await billingActions.syncV2({
		ctx,
		params: incremental.params,
	});
	await trackSyncResult({
		ctx,
		subscriptionUpdatedContext,
		result,
		linkedCustomerProducts,
	});
	logger.info(
		`sub.updated auto-sync applied ${stripeSubscription.id}: expired=${result.expired_cus_product_ids.length}, inserted=${result.inserted_cus_product_ids.length}, removed=${incremental.removedCustomerProducts.length}`,
	);
};
