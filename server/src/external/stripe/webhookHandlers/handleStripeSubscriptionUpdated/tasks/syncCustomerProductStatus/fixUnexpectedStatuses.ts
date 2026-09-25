import {
	ALL_STATUSES,
	type CollectionMethod,
	type CusProductStatus,
	type FullCustomer,
} from "@autumn/shared";
import type { ExpandedStripeSubscription } from "@/external/stripe/subscriptions/operations/getExpandedStripeSubscription";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import type { SubscriptionPreviousAttributes } from "../../stripeSubscriptionUpdatedContext";
import { getStripeOwnedFieldUpdates } from "./getStripeOwnedFieldUpdates";

/**
 * Safety net: fix any customer products with unexpected statuses.
 * This catches edge cases where customer products have statuses outside ALL_STATUSES.
 */
export const fixUnexpectedStatuses = async ({
	ctx,
	stripeSubscription,
	fullCustomer,
	autumnStatus,
	trialEndsAt,
	collectionMethod,
	previousAttributes,
}: {
	ctx: StripeWebhookContext;
	stripeSubscription: ExpandedStripeSubscription;
	fullCustomer: FullCustomer;
	autumnStatus: CusProductStatus;
	trialEndsAt: number | undefined;
	collectionMethod: CollectionMethod;
	previousAttributes: SubscriptionPreviousAttributes;
}) => {
	const { db, logger, org, env } = ctx;

	// This is a blind bulk write, so there is no current value to diff against:
	// mirror trial_end / collection_method only when Stripe changed them.
	return await CusProductService.updateByStripeSubId({
		db,
		stripeSubId: stripeSubscription.id,
		notInStatuses: ALL_STATUSES,
		updates: {
			status: autumnStatus,
			...getStripeOwnedFieldUpdates({
				previousAttributes,
				stripeTrialEndsAt: trialEndsAt,
				stripeCollectionMethod: collectionMethod,
			}),
		},
	});

	// if (cursoryUpdated.length > 0) {
	// 	Sentry.captureException(
	// 		new Error(
	// 			`[syncCustomerProductStatus] Cursory update needed - ${cursoryUpdated.length} products had unexpected statuses`,
	// 		),
	// 		{
	// 			extra: {
	// 				cusProductIds: cursoryUpdated.map((cp) => cp.id),
	// 				customerId: fullCustomer.id,
	// 				stripeSubId: stripeSubscription.id,
	// 				orgId: org.id,
	// 				env,
	// 			},
	// 		},
	// 	);
	// 	logger.warn(
	// 		`[syncCustomerProductStatus] Fixed ${cursoryUpdated.length} products with unexpected statuses`,
	// 	);
	// }
};
