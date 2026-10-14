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
};
