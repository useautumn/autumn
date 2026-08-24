import {
	type EntitlementPrice,
	type FullProduct,
	productToEntitlementPrices,
} from "@autumn/shared";
import { freeTrialsAreSame } from "@autumn/shared/utils/productUtils/freeTrialUtils.js";
import type { ProductTransitions } from "@/internal/billing/v2/actions/batchTransition/compute/transitions/computeProductTransitions.js";
import { entitlementPriceFilterMatchesEntitlementPrice } from "../../types/entitlementPriceFilter.js";
import type {
	BatchMigrationAddEntitlementOp,
	BatchMigrationRejection,
	EntitlementPriceFilter,
	PatchProductTransition,
} from "../../types/index.js";
import type { LicenseLinkTransitions } from "../transitions/resolvePlanLicenseTransitions.js";

const rejectEntitlementPrice = ({
	entitlementPrice,
	opIndex,
	planId,
	details,
	paidCode,
	includeRollover,
}: {
	entitlementPrice: EntitlementPrice;
	opIndex: number;
	planId: string;
	details: Record<string, unknown>;
	paidCode: "paid_entitlement_transition" | "priced_remove_item";
	includeRollover: boolean;
}): BatchMigrationRejection[] => {
	const { entitlement, price } = entitlementPrice;
	const rejections: BatchMigrationRejection[] = [];

	if (price) {
		rejections.push({
			code: paidCode,
			opIndex,
			planId,
			message:
				paidCode === "priced_remove_item"
					? "A paid item needs a Stripe write; only free entitlements are batch-lowered."
					: "A paid item needs a Stripe write; only free entitlement replaces are batch-lowered.",
			details,
		});
	}

	if (includeRollover && entitlement.rollover) {
		rejections.push({
			code: "rollover_remove_item",
			opIndex,
			planId,
			message:
				"A rollover balance outlives the row it hangs off, so dropping the row strands it.",
			details,
		});
	}

	if (entitlement.entity_feature_id) {
		rejections.push({
			code: "entity_scoped_entitlement",
			opIndex,
			planId,
			message:
				"Entity-scoped rows carry per-entity sub-balances; row counts vary per customer.",
			details,
		});
	}

	if (entitlement.pooled === true) {
		rejections.push({
			code: "pooled_add_item",
			opIndex,
			planId,
			message:
				"A pooled item's anchor row hangs off no customer product, so the set-based writes never reach it.",
			details,
		});
	}

	return rejections;
};

const catalogEntitlementPricesMatching = ({
	fromProduct,
	filter,
}: {
	fromProduct: FullProduct;
	filter: EntitlementPriceFilter;
}): EntitlementPrice[] =>
	productToEntitlementPrices({ product: fromProduct }).filter(
		(entitlementPrice) =>
			entitlementPriceFilterMatchesEntitlementPrice({
				filter,
				entitlementPrice,
			}),
	);

/** Guards the computed transitions of one patch: anything beyond uniform,
 * free adds/removes/replaces rejects the patch to the per-customer lane. */
export const checkUpdatePlanTransitionEligibility = ({
	opIndex,
	fromProduct,
	productTransitions,
	toProduct,
	patchTransition,
	licenseLinks,
	operations,
}: {
	opIndex: number;
	fromProduct: FullProduct;
	productTransitions?: ProductTransitions;
	toProduct?: FullProduct;
	patchTransition?: PatchProductTransition;
	licenseLinks: LicenseLinkTransitions[];
	operations: BatchMigrationAddEntitlementOp[];
}): BatchMigrationRejection[] => {
	const rejections: BatchMigrationRejection[] = [];
	const targetProduct = toProduct ?? productTransitions?.toProduct;
	const paidAdded: EntitlementPrice[] = (
		productTransitions?.entitlementPrices.added ??
		patchTransition?.added ??
		[]
	).filter((entitlementPrice) => entitlementPrice.price);

	if (
		targetProduct &&
		!freeTrialsAreSame({
			ft1: fromProduct.free_trial,
			ft2: targetProduct.free_trial,
		})
	) {
		rejections.push({
			code: "free_trial_transition",
			opIndex,
			planId: fromProduct.id,
			message:
				"The target version changes the free trial config; trial transitions are not batch-lowered.",
		});
	}

	if (productTransitions?.basePrice) {
		rejections.push({
			code: "base_price_transition",
			opIndex,
			planId: fromProduct.id,
			message:
				"Projected patch changed the base price; base price transitions are not batch-lowered.",
			details: { type: productTransitions.basePrice.type },
		});
	}

	const { transitions, deleted } = productTransitions?.entitlementPrices ?? {
		transitions: [],
		deleted: [],
	};
	for (const transition of transitions) {
		const { fromEntitlementPrice, toEntitlementPrice } = transition;
		const sides = [fromEntitlementPrice, toEntitlementPrice];
		const details = {
			fromFeatureId: fromEntitlementPrice.entitlement.feature.id,
			toFeatureId: toEntitlementPrice.entitlement.feature.id,
		};

		if (sides.some((side) => side.price)) {
			rejections.push({
				code: "paid_entitlement_transition",
				opIndex,
				planId: fromProduct.id,
				message:
					"A paid item needs a Stripe write; only free entitlement replaces are batch-lowered.",
				details,
			});
		}

		if (sides.some((side) => side.entitlement.rollover)) {
			rejections.push({
				code: "rollover_remove_item",
				opIndex,
				planId: fromProduct.id,
				message:
					"Accrued rollover rows outlive an in-place definition swap uncleared and unclamped.",
				details,
			});
		}

		if (sides.some((side) => side.entitlement.entity_feature_id)) {
			rejections.push({
				code: "entity_scoped_entitlement",
				opIndex,
				planId: fromProduct.id,
				message:
					"Entity-scoped rows carry per-entity sub-balances; row counts vary per customer.",
				details,
			});
		}

		if (sides.some((side) => side.entitlement.pooled === true)) {
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

	for (const entitlementPrice of deleted) {
		rejections.push(
			...rejectEntitlementPrice({
				entitlementPrice,
				opIndex,
				planId: fromProduct.id,
				details: { featureId: entitlementPrice.entitlement.feature.id },
				paidCode: "priced_remove_item",
				includeRollover: true,
			}),
		);
	}

	if (patchTransition) {
		for (const pair of patchTransition.replaced) {
			const details = {
				fromFeatureId: pair.from.feature_id,
				toFeatureId: pair.to.entitlement.feature.id,
			};
			rejections.push(
				...rejectEntitlementPrice({
					entitlementPrice: pair.to,
					opIndex,
					planId: fromProduct.id,
					details,
					paidCode: "paid_entitlement_transition",
					includeRollover: true,
				}),
			);
			for (const from of catalogEntitlementPricesMatching({
				fromProduct,
				filter: pair.from,
			})) {
				rejections.push(
					...rejectEntitlementPrice({
						entitlementPrice: from,
						opIndex,
						planId: fromProduct.id,
						details,
						paidCode: "paid_entitlement_transition",
						includeRollover: true,
					}),
				);
			}
		}

		for (const { filter } of patchTransition.removed) {
			for (const entitlementPrice of catalogEntitlementPricesMatching({
				fromProduct,
				filter,
			})) {
				rejections.push(
					...rejectEntitlementPrice({
						entitlementPrice,
						opIndex,
						planId: fromProduct.id,
						details: { featureId: entitlementPrice.entitlement.feature.id },
						paidCode: "priced_remove_item",
						includeRollover: true,
					}),
				);
			}
		}
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
		const details = { featureId: entitlement.feature.id };

		if (entitlement.entity_feature_id) {
			rejections.push({
				code: "entity_scoped_entitlement",
				opIndex,
				planId: fromProduct.id,
				message:
					"Adding an entity-scoped entitlement fans out per entity; row counts vary per customer.",
				details: {
					...details,
					entityFeatureId: entitlement.entity_feature_id,
				},
			});
		}

		if (entitlement.pooled === true) {
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

	for (const link of licenseLinks) {
		const transitionSides = [
			...link.transitions.added,
			...link.transitions.deleted,
			...link.transitions.transitions.flatMap(
				({ fromEntitlementPrice, toEntitlementPrice }) => [
					fromEntitlementPrice,
					toEntitlementPrice,
				],
			),
		];
		const linkDetails = { licensePlanId: link.licensePlanId };
		if (link.basePrice) {
			rejections.push({
				code: "paid_entitlement_transition",
				opIndex,
				planId: fromProduct.id,
				message:
					"The target version changes the seat price; a pool repoint cannot move the seats onto it.",
				details: { ...linkDetails, type: link.basePrice.type },
			});
		}
		if (transitionSides.some((entitlementPrice) => entitlementPrice.price)) {
			rejections.push({
				code: "paid_entitlement_transition",
				opIndex,
				planId: fromProduct.id,
				message:
					"A license price transition needs billing writes; the batch lane only repoints unchanged pricing.",
				details: linkDetails,
			});
		}
		if (
			transitionSides.some(
				(entitlementPrice) => entitlementPrice.entitlement.rollover,
			)
		) {
			rejections.push({
				code: "rollover_remove_item",
				opIndex,
				planId: fromProduct.id,
				message:
					"License rollover transitions require customer-specific balance handling.",
				details: linkDetails,
			});
		}
		if (
			transitionSides.some((entitlementPrice) =>
				Boolean(entitlementPrice.entitlement.entity_feature_id),
			)
		) {
			rejections.push({
				code: "entity_scoped_entitlement",
				opIndex,
				planId: fromProduct.id,
				message:
					"Entity-scoped license transitions vary by customer assignment.",
				details: linkDetails,
			});
		}
		if (
			transitionSides.some(
				(entitlementPrice) => entitlementPrice.entitlement.pooled === true,
			)
		) {
			rejections.push({
				code: "pooled_add_item",
				opIndex,
				planId: fromProduct.id,
				message:
					"Pooled license transitions cannot be reached by assignment-scoped writes.",
				details: linkDetails,
			});
		}

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
	}

	return rejections;
};
