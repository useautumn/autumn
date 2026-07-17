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
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan.js";
import { customerProductToPooledBalanceRemovalOp } from "@/internal/billing/v2/pooledBalances/compute/customerProductToPooledBalanceRemovalOp.js";
import { isAutumnManagedSubscriptionMetadata } from "@/internal/billing/v2/providers/stripe/utils/common/autumnStripeMetadata";
import type { StripeWebhookContext } from "../../../webhookMiddlewares/stripeWebhookContext";
import { trackCustomerProductUpdate } from "../../common/trackCustomerProductUpdate";
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

export const expireRemovedCustomerProducts = async ({
	ctx,
	subscriptionUpdatedContext,
	removedCustomerProducts,
	nowMs = Date.now(),
	dependencies = {
		executeAutumnBillingPlan,
		trackCustomerProductUpdate,
	},
}: {
	ctx: StripeWebhookContext;
	subscriptionUpdatedContext: StripeSubscriptionUpdatedContext;
	removedCustomerProducts: FullCusProduct[];
	nowMs?: number;
	dependencies?: {
		executeAutumnBillingPlan: typeof executeAutumnBillingPlan;
		trackCustomerProductUpdate: typeof trackCustomerProductUpdate;
	};
}) => {
	const pooledBalanceOps = removedCustomerProducts.flatMap(
		(customerProduct) => {
			const operation = customerProductToPooledBalanceRemovalOp({
				customerProduct,
				effectiveAt: null,
			});
			return operation ? [operation] : [];
		},
	);
	const customerId =
		subscriptionUpdatedContext.fullCustomer.id ??
		subscriptionUpdatedContext.fullCustomer.internal_id;
	const updates = {
		status: CusProductStatus.Expired,
		ended_at: nowMs,
		canceled: true,
		canceled_at: nowMs,
	};
	await dependencies.executeAutumnBillingPlan({
		ctx,
		autumnBillingPlan: {
			customerId,
			insertCustomerProducts: [],
			updateCustomerProducts: removedCustomerProducts.map(
				(customerProduct) => ({ customerProduct, updates }),
			),
			pooledBalanceOps,
		},
	});

	for (const customerProduct of removedCustomerProducts) {
		dependencies.trackCustomerProductUpdate({
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

	await expireRemovedCustomerProducts({
		ctx,
		subscriptionUpdatedContext,
		removedCustomerProducts: incremental.removedCustomerProducts,
	});

	if (!incremental.params) {
		logger.info(
			`sub.updated auto-sync applied ${stripeSubscription.id}: removed=${incremental.removedCustomerProducts.length}`,
		);
		return;
	}

	const result = await billingActions.syncV2({
		ctx,
		params: incremental.params,
		tags: ["sync:customer.subscription.updated"],
	});
	logger.info(
		`sub.updated auto-sync applied ${stripeSubscription.id}: expired=${result.expired_cus_product_ids.length}, inserted=${result.inserted_cus_product_ids.length}, removed=${incremental.removedCustomerProducts.length}`,
	);
};
