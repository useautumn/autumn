import type {
	BillingContext,
	UpdateSubscriptionBillingContext,
} from "@autumn/shared";
import type { EntityFacts } from "@autumn/shared/api/approvals/evaluate/index.js";

/**
 * The entity a change acts on, or null at the customer level. An update can name
 * its plan by `customer_product_id` alone, so the targeted plan's entity counts too.
 */
export const billingContextToEntityFacts = ({
	billingContext,
}: {
	billingContext: BillingContext;
}): EntityFacts => {
	const { fullCustomer } = billingContext;
	const targetEntityId = (
		billingContext as Partial<UpdateSubscriptionBillingContext>
	).customerProduct?.internal_entity_id;
	const entity =
		fullCustomer.entity ??
		fullCustomer.entities?.find(
			({ internal_id }) => internal_id === targetEntityId,
		);
	return entity ? { feature_id: entity.feature_id } : null;
};
