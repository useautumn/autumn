import type { EntitlementPrice, FullProduct } from "@autumn/shared";
import type { ProductTransitions } from "@/internal/billing/v2/actions/batchTransition/compute/transitions/computeProductTransitions.js";
import type {
	BatchMigrationAddEntitlementOp,
	BatchMigrationRejection,
} from "../../types/index.js";

/** Guards the computed transitions of one add-only patch: anything beyond
 * uniform, free, non-resetting adds rejects the patch to the per-customer lane. */
export const checkUpdatePlanTransitionEligibility = ({
	opIndex,
	fromProduct,
	productTransitions,
	operations,
}: {
	opIndex: number;
	fromProduct: FullProduct;
	productTransitions: ProductTransitions;
	operations: BatchMigrationAddEntitlementOp[];
}): BatchMigrationRejection[] => {
	const rejections: BatchMigrationRejection[] = [];
	const paidAdded: EntitlementPrice[] =
		productTransitions.entitlementPrices.added.filter(
			(entitlementPrice) => entitlementPrice.price,
		);

	if (productTransitions.basePrice) {
		rejections.push({
			code: "base_price_transition",
			opIndex,
			planId: fromProduct.id,
			message:
				"Projected patch changed the base price; base price transitions are not batch-lowered.",
			details: { type: productTransitions.basePrice.type },
		});
	}

	const { transitions, deleted } = productTransitions.entitlementPrices;
	if (transitions.length > 0 || deleted.length > 0) {
		rejections.push({
			code: "non_add_operation",
			opIndex,
			planId: fromProduct.id,
			message:
				"Projected diff produced non-add transitions; the batch lane is add_items-only.",
			details: {
				featureIds: [
					...transitions.map(
						(transition) =>
							transition.fromEntitlementPrice.entitlement.feature.id,
					),
					...deleted.map(
						(entitlementPrice) => entitlementPrice.entitlement.feature.id,
					),
				],
			},
		});
	}

	if (paidAdded.length > 0) {
		rejections.push({
			code: "paid_entitlement_transition",
			opIndex,
			planId: fromProduct.id,
			message:
				"Patch adds paid entitlement prices; only free entitlements are batch-lowered.",
			details: {
				featureIds: paidAdded.map(
					(entitlementPrice) => entitlementPrice.entitlement.feature.id,
				),
			},
		});
	}

	for (const operation of operations) {
		const entitlement = operation.entitlementPrice.entitlement;

		if (entitlement.entity_feature_id) {
			rejections.push({
				code: "entity_scoped_entitlement",
				opIndex,
				planId: fromProduct.id,
				message:
					"Adding an entity-scoped entitlement fans out per entity; row counts vary per customer.",
				details: {
					featureId: entitlement.feature.id,
					entityFeatureId: entitlement.entity_feature_id,
				},
			});
		}
	}

	return rejections;
};
