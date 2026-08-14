import type { EntitlementPrice, FullProduct } from "@autumn/shared";
import type { ProductTransitions } from "@/internal/billing/v2/actions/batchTransition/compute/transitions/computeProductTransitions.js";
import type {
	BatchMigrationAddEntitlementOp,
	BatchMigrationRejection,
} from "../../types/index.js";
import type { LicenseLinkTransitions } from "../transitions/resolveLicenseCustomizeTransitions.js";

/** Guards the computed transitions of one add-only patch: anything beyond
 * uniform, free, non-resetting adds rejects the patch to the per-customer lane. */
export const checkUpdatePlanTransitionEligibility = ({
	opIndex,
	fromProduct,
	productTransitions,
	licenseLinks,
	operations,
}: {
	opIndex: number;
	fromProduct: FullProduct;
	productTransitions: ProductTransitions;
	licenseLinks: LicenseLinkTransitions[];
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

	for (const link of licenseLinks) {
		for (const artifact of link.artifacts) {
			const details = {
				licensePlanId: link.licensePlanId,
				featureId: artifact.removes_filter?.feature_id,
			};

			if (artifact.removes_priced_item) {
				rejections.push({
					code: "priced_remove_item",
					opIndex,
					planId: fromProduct.id,
					message:
						"A paid item needs a Stripe write; only free entitlements are batch-lowered.",
					details,
				});
			}

			if (artifact.removes_rollover_item) {
				rejections.push({
					code: "rollover_remove_item",
					opIndex,
					planId: fromProduct.id,
					message:
						"A rollover balance outlives the row it hangs off, so dropping the row strands it.",
					details,
				});
			}

			if (artifact.removes_entity_scoped_item) {
				rejections.push({
					code: "entity_scoped_entitlement",
					opIndex,
					planId: fromProduct.id,
					message:
						"Entity-scoped rows carry per-entity sub-balances; row counts vary per customer.",
					details,
				});
			}

			if (artifact.adds_pooled_item || artifact.removes_pooled_item) {
				rejections.push({
					code: "pooled_add_item",
					opIndex,
					planId: fromProduct.id,
					message:
						"A pooled item's anchor row hangs off no customer product, so the set-based writes never reach it.",
					details,
				});
			}
		}

		for (const entitlementPrice of link.transitions.added) {
			if (!entitlementPrice.entitlement.entity_feature_id) continue;
			rejections.push({
				code: "entity_scoped_entitlement",
				opIndex,
				planId: fromProduct.id,
				message:
					"Adding an entity-scoped entitlement fans out per entity; row counts vary per customer.",
				details: {
					licensePlanId: link.licensePlanId,
					featureId: entitlementPrice.entitlement.feature.id,
				},
			});
		}
	}

	return rejections;
};
