import type { FullCusProduct } from "@autumn/shared";
import { customerProductsToMainPlanName } from "@autumn/shared";
import type { SetPlansSubscriptionTarget } from "@/components/forms/create-schedule/types/setPlansSubscriptionTarget";
import {
	collectLinkedStripeObjectIds,
	countLinkedStripeObjects,
	isLiveCustomerProduct,
	type LinkedStripeObjectIds,
} from "./collectLinkedStripeObjectIds";
import { formatStripeObjectId } from "./formatStripeObjectId";

export type SetPlansEntry =
	| { kind: "choose_subscription" }
	| {
			kind: "set_plans";
			subscriptionTarget: SetPlansSubscriptionTarget | null;
	  };

const MAX_LINKED_OBJECTS_WITHOUT_PICKER = 1;

const hasSeveralLinkedObjects = (linkedIds: LinkedStripeObjectIds) =>
	countLinkedStripeObjects(linkedIds) > MAX_LINKED_OBJECTS_WITHOUT_PICKER;

/** The subscription's own schedule, so its scheduled plans seed too. */
const findScheduleIdOfSubscription = ({
	customerProducts,
	stripeSubscriptionId,
}: {
	customerProducts: FullCusProduct[];
	stripeSubscriptionId: string;
}) =>
	customerProducts
		.filter(isLiveCustomerProduct)
		.find((customerProduct) =>
			customerProduct.subscription_ids?.includes(stripeSubscriptionId),
		)?.scheduled_ids?.[0] ?? null;

const onlyLinkedObjectToTarget = ({
	linkedIds,
	customerProducts,
}: {
	linkedIds: LinkedStripeObjectIds;
	customerProducts: FullCusProduct[];
}): SetPlansSubscriptionTarget | null => {
	const [stripeSubscriptionId] = linkedIds.subscriptionIds;
	if (stripeSubscriptionId) {
		return {
			key: stripeSubscriptionId,
			stripeSubscriptionId,
			stripeScheduleId: findScheduleIdOfSubscription({
				customerProducts,
				stripeSubscriptionId,
			}),
			planName: customerProductsToMainPlanName({
				customerProducts: customerProducts.filter(
					(customerProduct) =>
						isLiveCustomerProduct(customerProduct) &&
						customerProduct.subscription_ids?.includes(stripeSubscriptionId),
				),
			}),
			stripeObjectId: formatStripeObjectId(stripeSubscriptionId),
			details: null,
			canChange: false,
		};
	}

	const [stripeScheduleId] = linkedIds.standaloneScheduleIds;
	if (!stripeScheduleId) return null;
	return {
		key: stripeScheduleId,
		stripeSubscriptionId: null,
		stripeScheduleId,
		planName: customerProductsToMainPlanName({
			customerProducts: customerProducts.filter(
				(customerProduct) =>
					isLiveCustomerProduct(customerProduct) &&
					customerProduct.scheduled_ids?.includes(stripeScheduleId),
			),
		}),
		stripeObjectId: formatStripeObjectId(stripeScheduleId),
		details: null,
		canChange: false,
	};
};

/** Several linked subscriptions need a choice first; one or none opens Set
 * Plans as before. On an entity page the entity's own plans decide. */
export const decideSetPlansEntry = ({
	customerProducts,
	entityId,
}: {
	customerProducts: FullCusProduct[];
	entityId: string | null;
}): SetPlansEntry => {
	const customerLinkedIds = collectLinkedStripeObjectIds({ customerProducts });
	if (!hasSeveralLinkedObjects(customerLinkedIds)) {
		return { kind: "set_plans", subscriptionTarget: null };
	}
	if (!entityId) return { kind: "choose_subscription" };

	const entityCustomerProducts = customerProducts.filter(
		(customerProduct) => customerProduct.entity_id === entityId,
	);
	const entityLinkedIds = collectLinkedStripeObjectIds({
		customerProducts: entityCustomerProducts,
	});
	if (hasSeveralLinkedObjects(entityLinkedIds)) {
		return { kind: "choose_subscription" };
	}
	return {
		kind: "set_plans",
		subscriptionTarget: onlyLinkedObjectToTarget({
			linkedIds: entityLinkedIds,
			customerProducts: entityCustomerProducts,
		}),
	};
};
