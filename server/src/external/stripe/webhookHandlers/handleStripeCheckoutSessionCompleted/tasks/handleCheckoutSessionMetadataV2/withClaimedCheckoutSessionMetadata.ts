import {
	type DeferredAutumnBillingPlanData,
	MetadataType,
} from "@autumn/shared";
import { setStripeSubscriptionLock } from "@/external/stripe/subscriptions/utils/lockStripeSubscriptionUtils";
import type { CheckoutSessionCompletedContext } from "@/external/stripe/webhookHandlers/handleStripeCheckoutSessionCompleted/setupCheckoutSessionCompletedContext";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { checkoutSessionLock } from "@/internal/billing/v2/actions/locks/checkoutSessionLock/checkoutSessionLock";
import { MetadataService } from "@/internal/metadata/MetadataService";

/**
 * Runs `execute` exactly once across concurrent executors of the same deferred
 * plan. The subscription lock marks the resulting subscription.updated events
 * as Autumn-initiated; the checkout session lock is cleared even on failure
 * since the Stripe session is already paid.
 */
export const withClaimedCheckoutSessionMetadata = async ({
	ctx,
	checkoutContext,
	metadata,
	execute,
}: {
	ctx: StripeWebhookContext;
	checkoutContext: CheckoutSessionCompletedContext;
	metadata: NonNullable<CheckoutSessionCompletedContext["metadata"]>;
	execute: () => Promise<void>;
}): Promise<void> => {
	const claimed = await MetadataService.claim({
		db: ctx.db,
		id: metadata.id,
		fromType: MetadataType.CheckoutSessionV2,
		toType: MetadataType.CheckoutSessionV2Processing,
	});

	if (!claimed) {
		ctx.logger.info(
			`[checkout.completed] Metadata ${metadata.id} already claimed by another executor, skipping`,
		);
		return;
	}

	if (checkoutContext.stripeSubscription) {
		await setStripeSubscriptionLock({
			stripeSubscriptionId: checkoutContext.stripeSubscription.id,
			lockedAtMs: Date.now(),
		});
	}

	const deferredData = metadata.data as DeferredAutumnBillingPlanData;
	const lockCustomerId =
		deferredData?.billingContext?.fullCustomer?.id ??
		deferredData?.billingContext?.fullCustomer?.internal_id;

	try {
		await execute();
	} catch (error) {
		await revertMetadataClaim({ ctx, metadataId: metadata.id });
		throw error;
	} finally {
		if (lockCustomerId) {
			await checkoutSessionLock.clear({ ctx, customerId: lockCustomerId });
		}
	}
};

const revertMetadataClaim = async ({
	ctx,
	metadataId,
}: {
	ctx: StripeWebhookContext;
	metadataId: string;
}): Promise<void> => {
	await MetadataService.claim({
		db: ctx.db,
		id: metadataId,
		fromType: MetadataType.CheckoutSessionV2Processing,
		toType: MetadataType.CheckoutSessionV2,
	}).catch((revertError) => {
		ctx.logger.error(
			`[checkout.completed] Failed to revert metadata claim for ${metadataId}`,
			{ revertError },
		);
	});
};
