import {
	AttachScenario,
	type AutumnBillingPlan,
	cp,
	type FullCusProduct,
	notNullish,
	type PooledBalanceOp,
} from "@autumn/shared";
import { msToSeconds } from "@shared/utils/common/unixUtils";
import { getStripeSubscriptionLock } from "@/external/stripe/subscriptions/utils/lockStripeSubscriptionUtils";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { addProductsUpdatedWebhookTask } from "@/internal/analytics/handlers/handleProductsUpdated";
import { executeAutumnBillingPlan } from "@/internal/billing/v2/execute/executeAutumnBillingPlan.js";
import {
	customerProductToPooledBalanceOwnerRemovalOp,
	customerProductToPooledBalanceRemovalOp,
} from "@/internal/billing/v2/pooledBalances/compute/customerProductToPooledBalanceRemovalOp.js";
import { trackCustomerProductUpdate } from "../../../common/trackCustomerProductUpdate";
import type { StripeSubscriptionUpdatedContext } from "../../stripeSubscriptionUpdatedContext";
import { isStripeSubscriptionCanceledEvent } from "./isStripeSubscriptionCanceledEvent";
import { scheduleDefaultProducts } from "./scheduleDefaultProducts";

/**
 * Handles external subscription cancellations (from Stripe dashboard/portal).
 *
 * This task:
 * 1. Detects if subscription was just canceled
 * 2. Skips if Autumn initiated the cancellation (via lock)
 * 3. Marks active customer products as canceled
 * 4. Schedules default products for non-add-on groups
 * 5. Sends cancel webhooks (after defaults are scheduled)
 */
export type HandleStripeSubscriptionCanceledDependencies = {
	getStripeSubscriptionLock: typeof getStripeSubscriptionLock;
	executeAutumnBillingPlan: typeof executeAutumnBillingPlan;
	scheduleDefaultProducts: typeof scheduleDefaultProducts;
	addProductsUpdatedWebhookTask: typeof addProductsUpdatedWebhookTask;
};

export const handleStripeSubscriptionCanceledWithDependencies = async ({
	ctx,
	subscriptionUpdatedContext,
	dependencies = {
		getStripeSubscriptionLock,
		executeAutumnBillingPlan,
		scheduleDefaultProducts,
		addProductsUpdatedWebhookTask,
	},
}: {
	ctx: StripeWebhookContext;
	subscriptionUpdatedContext: StripeSubscriptionUpdatedContext;
	dependencies?: HandleStripeSubscriptionCanceledDependencies;
}): Promise<void> => {
	const { org, env, logger } = ctx;
	const {
		stripeSubscription,
		previousAttributes,
		customerProducts,
		fullCustomer,
	} = subscriptionUpdatedContext;

	// 1. Check if this is actually a cancellation event
	const { canceled, canceledAtMs, cancelsAtMs } =
		isStripeSubscriptionCanceledEvent({
			stripeSubscription,
			previousAttributes,
		});

	if (!canceled) return;

	// 2. Check lock - if Autumn initiated this cancellation, skip
	const lock = await dependencies.getStripeSubscriptionLock({
		stripeSubscriptionId: stripeSubscription.id,
	});

	const hasSchedule = Boolean(stripeSubscription.schedule);

	if (lock || hasSchedule) {
		logger.info(
			`[handleStripeSubscriptionCanceled] Skipping - lock on stripe subscription found`,
		);
		return;
	}

	// PASS 1: Update cancellation status
	const allCanceledProducts: FullCusProduct[] = [];
	const canceledNonAddonProducts: FullCusProduct[] = [];
	const pooledBalanceOps: PooledBalanceOp[] = [];
	const updateCustomerProducts: NonNullable<
		AutumnBillingPlan["updateCustomerProducts"]
	> = [];

	for (const customerProduct of customerProducts) {
		const { valid: isActiveRecurringAndOnSub } = cp(customerProduct)
			.recurring()
			.hasActiveStatus()
			.onStripeSubscription({ stripeSubscriptionId: stripeSubscription.id });

		if (!isActiveRecurringAndOnSub) continue;

		// attach-set ends_at, not an external cancellation
		const endedAtMatchesCancelAt =
			notNullish(customerProduct.ended_at) &&
			notNullish(cancelsAtMs) &&
			msToSeconds(customerProduct.ended_at!) === msToSeconds(cancelsAtMs!);
		if (endedAtMatchesCancelAt) continue;

		const updates = {
			canceled_at: canceledAtMs ?? Date.now(),
			canceled: true,
			ended_at: cancelsAtMs ?? undefined,
		};

		updateCustomerProducts.push({ customerProduct, updates });

		allCanceledProducts.push(customerProduct);
		const pooledSourceRemoval = customerProductToPooledBalanceRemovalOp({
			customerProduct,
			effectiveAt: typeof cancelsAtMs === "number" ? cancelsAtMs : null,
		});
		if (pooledSourceRemoval) pooledBalanceOps.push(pooledSourceRemoval);
		if (typeof cancelsAtMs === "number") {
			pooledBalanceOps.push(
				customerProductToPooledBalanceOwnerRemovalOp({
					customerProduct,
					effectiveAt: cancelsAtMs,
				}),
			);
		}

		if (!customerProduct.product.is_add_on) {
			canceledNonAddonProducts.push(customerProduct);
		}
	}
	if (updateCustomerProducts.length > 0) {
		await dependencies.executeAutumnBillingPlan({
			ctx,
			autumnBillingPlan: {
				customerId: fullCustomer.id ?? fullCustomer.internal_id,
				insertCustomerProducts: [],
				updateCustomerProducts,
				pooledBalanceOps:
					pooledBalanceOps.length > 0 ? pooledBalanceOps : undefined,
			},
		});
	}

	for (const { customerProduct, updates } of updateCustomerProducts) {
		trackCustomerProductUpdate({
			eventContext: subscriptionUpdatedContext,
			customerProduct,
			updates,
		});
		logger.info(
			`[handleStripeSubscriptionCanceled] Marked ${customerProduct.product.name} as canceled`,
		);
	}

	// PASS 2: Schedule default products
	let scheduledByGroup = new Map<string, FullCusProduct>();
	if (org.config.sync_status && canceledNonAddonProducts.length > 0) {
		scheduledByGroup = await dependencies.scheduleDefaultProducts({
			ctx,
			subscriptionUpdatedContext,
			canceledCustomerProducts: canceledNonAddonProducts,
		});
	}

	// PASS 3: Send cancel webhooks (after defaults are scheduled)
	for (const customerProduct of allCanceledProducts) {
		const scheduledCusProduct = scheduledByGroup.get(
			customerProduct.product.group,
		);

		await dependencies.addProductsUpdatedWebhookTask({
			ctx,
			internalCustomerId: fullCustomer.internal_id,
			org,
			env,
			customerId: fullCustomer.id ?? null,
			scenario: AttachScenario.Cancel,
			cusProduct: customerProduct,
			scheduledCusProduct,
		});
	}
};

export const handleStripeSubscriptionCanceled = async ({
	ctx,
	subscriptionUpdatedContext,
}: {
	ctx: StripeWebhookContext;
	subscriptionUpdatedContext: StripeSubscriptionUpdatedContext;
}): Promise<void> =>
	handleStripeSubscriptionCanceledWithDependencies({
		ctx,
		subscriptionUpdatedContext,
	});
