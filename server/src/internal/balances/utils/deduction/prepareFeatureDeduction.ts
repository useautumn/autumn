import {
	cusEntToStartingBalance,
	type FullCustomer,
	fullCustomerToCustomerEntitlements,
	getMaxOverage,
	getRelevantFeatures,
	isAllocatedCustomerEntitlement,
	isFreeCustomerEntitlement,
	notNullish,
	orgToInStatuses,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getUnlimitedAndUsageAllowed } from "@/internal/customers/cusProducts/cusEnts/cusEntUtils.js";
import { getCreditCost } from "@/internal/features/creditSystemUtils.js";
import type {
	CustomerEntitlementDeduction,
	DeductionOptions,
	PreparedFeatureDeduction,
} from "../types/deductionTypes.js";
import type { FeatureDeduction } from "../types/featureDeduction.js";

/**
 * Prepares all the inputs needed to execute a deduction for a single feature.
 * Shared by both Redis (Lua) and Postgres (SQL) deduction paths.
 */
export const prepareFeatureDeduction = ({
	ctx,
	fullCustomer,
	deduction,
	options = {},
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	deduction: FeatureDeduction;
	options?: DeductionOptions;
}): PreparedFeatureDeduction => {
	const { org } = ctx;
	const { feature, targetBalance } = deduction;

	const { overageBehaviour = "cap", customerEntitlementFilters } = options;

	// Get relevant features (just the feature itself if targetBalance is set)
	const relevantFeatures = notNullish(targetBalance)
		? [feature]
		: getRelevantFeatures({
				features: ctx.features,
				featureId: feature.id,
			});

	// Get customer entitlements for these features (includes both product and loose entitlements)
	const cusEnts = fullCustomerToCustomerEntitlements({
		fullCustomer,
		featureIds: relevantFeatures.map((f) => f.id),
		reverseOrder: org.config?.reverse_deduction_order,
		entity: fullCustomer.entity,
		inStatuses: orgToInStatuses({ org }),
		customerEntitlementFilters,
	});

	// Check if ANY relevant feature is unlimited
	const unlimitedFeatureIds: string[] = [];

	for (const rf of relevantFeatures) {
		const { unlimited: featureUnlimited } = getUnlimitedAndUsageAllowed({
			cusEnts,
			internalFeatureId: rf.internal_id!,
		});

		if (featureUnlimited) {
			unlimitedFeatureIds.push(rf.id);
		}
	}

	// Build input for each customer entitlement
	const customerEntitlementDeductions: CustomerEntitlementDeduction[] =
		cusEnts.map((ce) => {
			const creditCost = getCreditCost({
				featureId: feature.id,
				creditSystem: ce.entitlement.feature,
			});

			const maxOverage = getMaxOverage({ cusEnt: ce });

			const isFreeAllocated =
				isFreeCustomerEntitlement(ce) && isAllocatedCustomerEntitlement(ce);

			const resetBalance = cusEntToStartingBalance({ cusEnt: ce });

			const isFreeAllocatedUsageAllowed =
				isFreeAllocated && overageBehaviour !== "reject";

			return {
				customer_entitlement_id: ce.id,
				credit_cost: creditCost,
				entity_feature_id: ce.entitlement.entity_feature_id ?? null,
				usage_allowed: ce.usage_allowed || isFreeAllocatedUsageAllowed,
				min_balance: notNullish(maxOverage) ? -maxOverage : undefined,
				max_balance: resetBalance,
			};
		});

	// Collect and sort rollovers by expires_at (oldest first), including credit_cost from parent entitlement
	const sortedRollovers = cusEnts
		.flatMap((ce) => {
			const creditCost = getCreditCost({
				featureId: feature.id,
				creditSystem: ce.entitlement.feature,
			});
			return (ce.rollovers || []).map((r) => ({
				...r,
				credit_cost: creditCost,
			}));
		})
		.sort((a, b) => {
			if (a.expires_at && b.expires_at) return a.expires_at - b.expires_at;
			if (a.expires_at && !b.expires_at) return -1;
			if (!a.expires_at && b.expires_at) return 1;
			return 0;
		});

	return {
		customerEntitlements: cusEnts,
		customerEntitlementDeductions,
		rollovers: sortedRollovers.map((r) => ({
			id: r.id,
			credit_cost: r.credit_cost,
		})),
		unlimitedFeatureIds,
	};
};
