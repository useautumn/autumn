import type { AutumnBillingPlan } from "@autumn/shared";
import type { StripeSubscriptionDeletedContext } from "../handleStripeSubscriptionDeleted/setupStripeSubscriptionDeletedContext";
import type { StripeSubscriptionUpdatedContext } from "../handleStripeSubscriptionUpdated/stripeSubscriptionUpdatedContext";

type EventContext =
	| StripeSubscriptionUpdatedContext
	| StripeSubscriptionDeletedContext;

export const eventContextToAutumnBillingPlan = (
	eventContext: EventContext,
): AutumnBillingPlan =>
	({
		customerId:
			eventContext.fullCustomer.id ?? eventContext.fullCustomer.internal_id,
		insertCustomerProducts: eventContext.insertedCustomerProducts,
		updateCustomerProducts: eventContext.updatedCustomerProducts,
		deleteCustomerProducts: eventContext.deletedCustomerProducts,
	}) as AutumnBillingPlan;
