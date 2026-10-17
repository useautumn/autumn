import type { MultiAttachBillingContext } from "@autumn/shared";
import type {
	BillingChangeFacts,
	EntityFacts,
} from "@autumn/shared/api/approvals/evaluate/index.js";

/**
 * A multi-attach judged plan by plan: each item sees its own plan and entity
 * beside the request's totals, so one item can't pass for another.
 */
export const splitMultiAttachFacts = ({
	facts,
	billingContext,
}: {
	facts: BillingChangeFacts;
	billingContext: MultiAttachBillingContext;
}): BillingChangeFacts[] => {
	const unclaimed = [...billingContext.productContexts];
	return facts.incoming.map((plan) => {
		const index = unclaimed.findIndex(
			({ fullProduct }) => fullProduct.internal_id === plan.product.internal_id,
		);
		const [productContext] = index >= 0 ? unclaimed.splice(index, 1) : [];
		// A matched plan keeps its own scope, customer level included.
		const planEntity = productContext?.fullCustomer.entity;
		const entity: EntityFacts = !productContext
			? facts.entity
			: planEntity
				? { feature_id: planEntity.feature_id }
				: null;
		return { ...facts, incoming: [plan], entity };
	});
};
