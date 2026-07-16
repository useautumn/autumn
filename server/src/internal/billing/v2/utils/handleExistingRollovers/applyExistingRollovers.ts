import {
	customerEntitlementAllowsRollovers,
	type ExistingRollover,
	type FullCusProduct,
	type FullCustomerEntitlement,
} from "@autumn/shared";
import { customerEntitlementToBillingType } from "@shared/utils/cusEntUtils/convertCusEntUtils/customerEntitlementToBillingType";
import { cusEntToEffectiveRolloverMax } from "@/internal/customers/cusProducts/cusEnts/cusRollovers/rolloverUtils";
import { generateId } from "@/utils/genUtils";

const KIND_MATCH_SCORE = 4;
const INTERVAL_MATCH_SCORE = 2;
const CAPACITY_SCORE = 1;

// Ranks same-feature candidates by item identity (billing kind, then reset
// interval — the same dimensions as item keys/filters), then by whether the
// bucket's effective max can actually hold a carried balance.
const scoreRolloverCandidate = ({
	customerProduct,
	cusEnt,
	existingRollover,
}: {
	customerProduct: FullCusProduct;
	cusEnt: FullCustomerEntitlement;
	existingRollover: ExistingRollover;
}): number => {
	let score = 0;

	const billingType = customerEntitlementToBillingType({
		cusEnt: { ...cusEnt, customer_product: customerProduct },
	});
	if (
		(billingType ?? null) === (existingRollover.source_billing_type ?? null)
	) {
		score += KIND_MATCH_SCORE;
	}

	const intervalMatches =
		(cusEnt.entitlement.interval ?? null) ===
			(existingRollover.source_interval ?? null) &&
		(cusEnt.entitlement.interval_count ?? 1) ===
			(existingRollover.source_interval_count ?? 1);
	if (intervalMatches) {
		score += INTERVAL_MATCH_SCORE;
	}

	const effectiveMax = cusEntToEffectiveRolloverMax({
		cusEnt: { ...cusEnt, customer_product: customerProduct },
	});
	if (effectiveMax === null || effectiveMax > 0) {
		score += CAPACITY_SCORE;
	}

	return score;
};

export const applyExistingRollovers = ({
	customerProduct,
	existingRollovers,
}: {
	customerProduct: FullCusProduct;
	existingRollovers: ExistingRollover[];
}) => {
	const getApplicableRollovers = (): ExistingRollover[] => {
		return existingRollovers.filter(
			(rollover) =>
				rollover.balance > 0 ||
				Object.values(rollover.entities).some((entity) => entity.balance > 0),
		);
	};

	for (const existingRollover of getApplicableRollovers()) {
		const candidates = customerProduct.customer_entitlements.filter(
			(cusEnt) =>
				cusEnt.entitlement.internal_feature_id ===
					existingRollover.internal_feature_id &&
				customerEntitlementAllowsRollovers(cusEnt),
		);

		let targetCusEnt: FullCustomerEntitlement | undefined;
		let bestScore = -1;
		for (const cusEnt of candidates) {
			const score = scoreRolloverCandidate({
				customerProduct,
				cusEnt,
				existingRollover,
			});
			if (score > bestScore) {
				targetCusEnt = cusEnt;
				bestScore = score;
			}
		}

		if (!targetCusEnt) continue;

		const {
			internal_feature_id: _internalFeatureId,
			source_billing_type: _sourceBillingType,
			source_interval: _sourceInterval,
			source_interval_count: _sourceIntervalCount,
			...rollover
		} = existingRollover;

		targetCusEnt.rollovers.push({
			...rollover,
			id: generateId("roll"),
			cus_ent_id: targetCusEnt.id,
		});
	}
};
