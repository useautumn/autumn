import {
	ALL_STATUSES,
	type CollectionMethod,
	type CusProductStatus,
	type FullCustomer,
} from "@autumn/shared";
import * as Sentry from "@sentry/bun";
import type { ExpandedStripeSubscription } from "@/external/stripe/subscriptions/operations/getExpandedStripeSubscription";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";

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
}: {
	ctx: StripeWebhookContext;
	stripeSubscription: ExpandedStripeSubscription;
	fullCustomer: FullCustomer;
	autumnStatus: CusProductStatus;
	trialEndsAt: number | undefined;
	collectionMethod: CollectionMethod;
}) => {
	const { db, logger, org, env } = ctx;

	const cursoryUpdated = await CusProductService.updateByStripeSubId({
		db,
		stripeSubId: stripeSubscription.id,
		notInStatuses: ALL_STATUSES,
		updates: {
			status: autumnStatus,
			trial_ends_at: trialEndsAt ?? null,
			collection_method: collectionMethod,
		},
	});

	if (cursoryUpdated.length > 0) {
		Sentry.captureException(
			new Error(
				`[syncCustomerProductStatus] Cursory update needed - ${cursoryUpdated.length} products had unexpected statuses`,
			),
			{
				extra: {
					cusProductIds: cursoryUpdated.map((cp) => cp.id),
					customerId: fullCustomer.id,
					stripeSubId: stripeSubscription.id,
					orgId: org.id,
					env,
				},
			},
		);
		logger.warn(
			`[syncCustomerProductStatus] Fixed ${cursoryUpdated.length} products with unexpected statuses`,
		);
	}
};
