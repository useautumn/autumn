import type Stripe from "stripe";
import { filterCustomerProductsByStripeSubscriptionId } from "@autumn/shared";
import { billingActions } from "@/internal/billing/v2/actions";
import { canAutoSync } from "@/internal/billing/v2/actions/sync/canAutoSync";
import { subscriptionToSyncParams } from "@/internal/billing/v2/actions/sync/subscriptionToSyncParams";
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
) =>
	typeof product === "string" ? product : product.id;

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
	if (currentItems.size !== previousAttributes.items.data.length) return false;

	return previousAttributes.items.data.some((previousItem) => {
		const currentItem = currentItems.get(previousItem.id);
		if (!currentItem) return false;

		return (
			currentItem.price.id !== previousItem.price.id ||
			stripeProductId(currentItem.price.product) !==
				stripeProductId(previousItem.price.product)
		);
	});
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

	const linkedProducts = filterCustomerProductsByStripeSubscriptionId({
		customerProducts,
		stripeSubscriptionId: stripeSubscription.id,
	});
	if (linkedProducts.length !== 1) return;

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

	const currentPhase = match.phaseMatches.find((phase) => phase.is_current);
	const matchedPlan = currentPhase?.plans[0];
	const linkedProduct = linkedProducts[0].product;
	if (
		!currentPhase ||
		currentPhase.plans.length !== 1 ||
		params.phases?.length !== 1 ||
		params.phases[0].plans.length !== 1 ||
		matchedPlan?.product.id === linkedProduct.id ||
		matchedPlan?.product.group !== linkedProduct.group
	) {
		return;
	}

	const result = await billingActions.syncV2({ ctx, params });

	for (const id of result.expired_cus_product_ids) {
		const customerProduct =
			customerProducts.find((cp) => cp.id === id) ??
			linkedProducts.find((cp) => cp.id === id);
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
