import type {
	AutumnBillingPlan,
	FullCusProduct,
	StripeBillingPlan,
} from "@autumn/shared";
import { CusProductStatus, cp } from "@autumn/shared";
import { isFreePhasePlaceholderCustomerProduct } from "@/internal/billing/v2/providers/stripe/utils/subscriptionSchedules/isFreePhasePlaceholderCustomerProduct";
import { getUpdateCustomerProducts } from "@/internal/billing/v2/utils/billingPlan/customerProductPlanMutations";

export const isOnStripeSchedule = ({
	customerProduct,
	linksFreePlaceholders,
}: {
	customerProduct: FullCusProduct;
	linksFreePlaceholders: boolean;
}) =>
	cp(customerProduct).paid().recurring().valid ||
	(linksFreePlaceholders &&
		isFreePhasePlaceholderCustomerProduct(customerProduct));

export const addStripeSubscriptionScheduleIdToBillingPlan = ({
	autumnBillingPlan,
	stripeBillingPlan,
	stripeSubscriptionScheduleId,
}: {
	autumnBillingPlan: AutumnBillingPlan;
	stripeBillingPlan: StripeBillingPlan;
	stripeSubscriptionScheduleId: string;
}) => {
	// Only create_schedule puts free plans on a Stripe schedule via a $0 placeholder.
	const linksFreePlaceholders =
		autumnBillingPlan.ownsSchedulePersistence === true;

	for (const customerProduct of autumnBillingPlan.insertCustomerProducts) {
		if (!isOnStripeSchedule({ customerProduct, linksFreePlaceholders })) {
			continue;
		}
		customerProduct.scheduled_ids = [stripeSubscriptionScheduleId];
	}

	for (const { customerProduct, updates } of getUpdateCustomerProducts({
		autumnBillingPlan,
	})) {
		const isExpiring = updates.status === CusProductStatus.Expired;
		if (isExpiring) continue;
		const updatedCustomerProduct: FullCusProduct = {
			...customerProduct,
			ended_at:
				"ended_at" in updates ? updates.ended_at : customerProduct.ended_at,
		};
		if (
			!isOnStripeSchedule({
				customerProduct: updatedCustomerProduct,
				linksFreePlaceholders,
			})
		) {
			continue;
		}
		updates.scheduled_ids = [stripeSubscriptionScheduleId];
	}

	const { subscriptionScheduleAction } = stripeBillingPlan;
	if (subscriptionScheduleAction?.type === "update") {
		// Get old schedule ID
		const oldScheduleId =
			subscriptionScheduleAction.stripeSubscriptionScheduleId;
		const newScheduleId = stripeSubscriptionScheduleId;

		if (oldScheduleId && newScheduleId && oldScheduleId !== newScheduleId) {
			autumnBillingPlan.updateByStripeScheduleId = {
				oldScheduleId,
				newScheduleId,
			};
		}
	}
};
