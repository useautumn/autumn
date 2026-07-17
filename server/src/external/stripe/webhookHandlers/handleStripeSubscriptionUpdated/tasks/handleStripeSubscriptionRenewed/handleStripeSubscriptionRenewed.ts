import {
	AttachScenario,
	type AutumnBillingPlan,
	cp,
	type FullCusProduct,
	findMainScheduledCustomerProductByGroup,
	type PooledBalanceOp,
} from "@autumn/shared";
import { getStripeSubscriptionLock } from "@/external/stripe/subscriptions/utils/lockStripeSubscriptionUtils";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { addProductsUpdatedWebhookTask } from "@/internal/analytics/handlers/handleProductsUpdated";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan.js";
import {
	customerProductToPooledBalanceOwnerRestoreOp,
	customerProductToPooledBalanceRestoreOp,
} from "@/internal/billing/v2/pooledBalances/compute/customerProductToPooledBalanceRemovalOp.js";
import {
	trackCustomerProductDeletion,
	trackCustomerProductUpdate,
} from "../../../common/trackCustomerProductUpdate";
import type { StripeSubscriptionUpdatedContext } from "../../stripeSubscriptionUpdatedContext";
import { isStripeSubscriptionRenewedEvent } from "./isStripeSubscriptionRenewedEvent";

/**
 * Handles subscription renewals (un-cancellations) from Stripe.
 *
 * This task:
 * 1. Detects if subscription was renewed (un-canceled)
 * 2. Skips if Autumn initiated or has schedule
 * 3. Clears cancellation fields on active customer products
 * 4. Deletes scheduled products for recurring main products (since they're staying)
 * 5. Sends renewal webhooks
 */
export type HandleStripeSubscriptionRenewedDependencies = {
	getStripeSubscriptionLock: typeof getStripeSubscriptionLock;
	executeAutumnBillingPlan: typeof executeAutumnBillingPlan;
	addProductsUpdatedWebhookTask: typeof addProductsUpdatedWebhookTask;
};

export const handleStripeSubscriptionRenewedWithDependencies = async ({
	ctx,
	subscriptionUpdatedContext,
	dependencies = {
		getStripeSubscriptionLock,
		executeAutumnBillingPlan,
		addProductsUpdatedWebhookTask,
	},
}: {
	ctx: StripeWebhookContext;
	subscriptionUpdatedContext: StripeSubscriptionUpdatedContext;
	dependencies?: HandleStripeSubscriptionRenewedDependencies;
}): Promise<void> => {
	const { org, env, logger } = ctx;
	const {
		stripeSubscription,
		previousAttributes,
		customerProducts,
		fullCustomer,
	} = subscriptionUpdatedContext;

	// 1. Check if this is actually a renewal event
	const { renewed } = isStripeSubscriptionRenewedEvent({
		stripeSubscription,
		previousAttributes,
	});

	if (!renewed) return;

	// 2. Check lock or schedule - skip if Autumn initiated or schedule exists
	const lock = await dependencies.getStripeSubscriptionLock({
		stripeSubscriptionId: stripeSubscription.id,
	});
	const hasSchedule = Boolean(stripeSubscription.schedule);

	if (lock || hasSchedule) {
		logger.info(
			`[handleStripeSubscriptionRenewed] Skipping - ${lock ? "lock found" : "has schedule"}`,
		);
		return;
	}
	const pooledBalanceOps: PooledBalanceOp[] = [];
	const updateCustomerProducts: NonNullable<
		AutumnBillingPlan["updateCustomerProducts"]
	> = [];
	const deleteCustomerProducts: FullCusProduct[] = [];
	const plannedDeletionIds = new Set<string>();
	const plannedRenewals: {
		customerProduct: FullCusProduct;
		updates: NonNullable<
			AutumnBillingPlan["updateCustomerProducts"]
		>[number]["updates"];
		deletedScheduledProduct?: FullCusProduct;
		sendWebhook: boolean;
	}[] = [];

	// Prepare from a stable snapshot; post-commit tracking mutates customerProducts.
	for (const customerProduct of [...customerProducts]) {
		// Skip if not active or not on this subscription

		const { valid } = cp(customerProduct)
			.recurring()
			.hasActiveStatus()
			.onStripeSubscription({ stripeSubscriptionId: stripeSubscription.id });

		if (!valid) continue;

		// attach-set ends_at expiry, not a cancellation
		if (!customerProduct.canceled && !customerProduct.canceled_at) continue;

		// Clear cancellation fields
		const updates = {
			canceled_at: null,
			canceled: false,
			ended_at: null,
		};

		updateCustomerProducts.push({ customerProduct, updates });
		const expectedEffectiveAt = customerProduct.ended_at;
		if (typeof expectedEffectiveAt === "number") {
			const pooledSourceRestore = customerProductToPooledBalanceRestoreOp({
				customerProduct,
				expectedEffectiveAt,
			});
			if (pooledSourceRestore) pooledBalanceOps.push(pooledSourceRestore);
			pooledBalanceOps.push(
				customerProductToPooledBalanceOwnerRestoreOp({
					customerProduct,
					expectedEffectiveAt,
				}),
			);
		}

		// For recurring main products, delete any scheduled product in the same group
		const { valid: isRecurringAndMain } = cp(customerProduct)
			.recurring()
			.main();

		let deletedScheduledProduct: FullCusProduct | undefined;
		if (org.config.sync_status && isRecurringAndMain) {
			const scheduledProduct = findMainScheduledCustomerProductByGroup({
				fullCustomer,
				productGroup: customerProduct.product.group,
				internalEntityId: customerProduct.internal_entity_id ?? undefined,
			});

			if (scheduledProduct && !plannedDeletionIds.has(scheduledProduct.id)) {
				plannedDeletionIds.add(scheduledProduct.id);
				deleteCustomerProducts.push(scheduledProduct);
				deletedScheduledProduct = scheduledProduct;
			}
		}

		plannedRenewals.push({
			customerProduct,
			updates,
			deletedScheduledProduct,
			sendWebhook: org.config.sync_status,
		});
	}

	if (updateCustomerProducts.length > 0) {
		await dependencies.executeAutumnBillingPlan({
			ctx,
			autumnBillingPlan: {
				customerId: fullCustomer.id ?? fullCustomer.internal_id,
				insertCustomerProducts: [],
				updateCustomerProducts,
				deleteCustomerProducts,
				pooledBalanceOps:
					pooledBalanceOps.length > 0 ? pooledBalanceOps : undefined,
			},
		});
	}

	for (const plannedRenewal of plannedRenewals) {
		const { customerProduct, updates, deletedScheduledProduct, sendWebhook } =
			plannedRenewal;
		trackCustomerProductUpdate({
			eventContext: subscriptionUpdatedContext,
			customerProduct,
			updates,
		});
		logger.info(
			`[handleStripeSubscriptionRenewed] Cleared cancellation for ${customerProduct.product.name}`,
		);

		if (deletedScheduledProduct) {
			logger.info(
				`[handleStripeSubscriptionRenewed] Deleted scheduled ${deletedScheduledProduct.product.name}`,
			);
			trackCustomerProductDeletion({
				eventContext: subscriptionUpdatedContext,
				customerProduct: deletedScheduledProduct,
			});
		}

		if (!sendWebhook) continue;
		await dependencies.addProductsUpdatedWebhookTask({
			ctx,
			internalCustomerId: fullCustomer.internal_id,
			org,
			env,
			customerId: fullCustomer.id ?? null,
			scenario: AttachScenario.Renew,
			cusProduct: customerProduct,
			deletedCusProduct: deletedScheduledProduct,
		});
	}
};

export const handleStripeSubscriptionRenewed = async ({
	ctx,
	subscriptionUpdatedContext,
}: {
	ctx: StripeWebhookContext;
	subscriptionUpdatedContext: StripeSubscriptionUpdatedContext;
}): Promise<void> =>
	handleStripeSubscriptionRenewedWithDependencies({
		ctx,
		subscriptionUpdatedContext,
	});
