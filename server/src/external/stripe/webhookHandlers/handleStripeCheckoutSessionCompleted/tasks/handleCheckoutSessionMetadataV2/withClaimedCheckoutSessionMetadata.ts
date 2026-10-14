import {
	type DeferredAutumnBillingPlanData,
	MetadataType,
} from "@autumn/shared";
import { checkoutSessionLock } from "@/external/redis/actions/checkoutSessionLock/checkoutSessionLock.js";
import { setStripeSubscriptionLock } from "@/external/redis/actions/stripeSubscriptionLock/stripeSubscriptionLock.js";
import type { CheckoutSessionCompletedContext } from "@/external/stripe/webhookHandlers/handleStripeCheckoutSessionCompleted/setupCheckoutSessionCompletedContext";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { MetadataService } from "@/internal/metadata/MetadataService";

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
	const deferredData = metadata.data as DeferredAutumnBillingPlanData;

	// Only the initiating org sends the webhook — handles when multiple Stripe
	const owningOrgId = deferredData?.billingContext?.fullCustomer?.org_id;
	if (owningOrgId && owningOrgId !== ctx.org.id) return;

	const lockCustomerId =
		deferredData?.billingContext?.fullCustomer?.id ??
		deferredData?.billingContext?.fullCustomer?.internal_id;

	const clearCheckoutReservation = async () => {
		if (!lockCustomerId) return;
		await checkoutSessionLock.clearIfOwned({
			ctx,
			customerId: lockCustomerId,
			checkoutSessionId: checkoutContext.stripeCheckoutSession.id,
		});
	};

	const claimed = await MetadataService.claim({
		db: ctx.db,
		id: metadata.id,
		fromType: MetadataType.CheckoutSessionV2,
		toType: MetadataType.CheckoutSessionV2Processing,
	});

	if (!claimed) {
		const current = await MetadataService.get({ db: ctx.db, id: metadata.id });
		if (current) {
			ctx.logger.info(
				`[checkout.completed] Metadata ${metadata.id} still owned by another executor, skipping`,
			);
			return;
		}

		ctx.logger.info(
			`[checkout.completed] Metadata ${metadata.id} already materialized, releasing checkout reservation`,
		);
		await clearCheckoutReservation();
		return;
	}

	try {
		if (checkoutContext.stripeSubscription) {
			await setStripeSubscriptionLock({
				ctx,
				stripeSubscriptionId: checkoutContext.stripeSubscription.id,
				lockedAtMs: Date.now(),
			});
		}

		await execute();
	} catch (error) {
		await revertMetadataClaim({ ctx, metadataId: metadata.id });
		throw error;
	} finally {
		await clearCheckoutReservation();
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
