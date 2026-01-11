import {
	cusEntToStartingBalance,
	cusProductsToCusEnts,
	type FullCustomer,
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
	FeatureDeduction,
	PreparedFeatureDeduction,
} from "../types/deductionTypes.js";

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
	const { feature, deduction: toDeduct, targetBalance } = deduction;

	const {
		overageBehaviour = "cap",
		addToAdjustment = false,
		sortParams,
	} = options;

	// Get relevant features (just the feature itself if targetBalance is set)
	const relevantFeatures = notNullish(targetBalance)
		? [feature]
		: getRelevantFeatures({
				features: ctx.features,
				featureId: feature.id,
			});

	// Get customer entitlements for these features
	const cusEnts = cusProductsToCusEnts({
		cusProducts: fullCustomer.customer_products,
		featureIds: relevantFeatures.map((f) => f.id),
		reverseOrder: org.config?.reverse_deduction_order,
		entity: fullCustomer.entity,
		inStatuses: orgToInStatuses({ org }),
		sortParams,
	});

	// Check if ANY relevant feature is unlimited
	let unlimited = false;
	const unlimitedFeatureIds: string[] = [];

	for (const rf of relevantFeatures) {
		const { unlimited: featureUnlimited } = getUnlimitedAndUsageAllowed({
			cusEnts,
			internalFeatureId: rf.internal_id!,
		});
		if (featureUnlimited) {
			unlimited = true;
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

			return {
				customer_entitlement_id: ce.id,
				credit_cost: creditCost,
				entity_feature_id: ce.entitlement.entity_feature_id ?? null,
				usage_allowed:
					ce.usage_allowed ||
					(isFreeAllocated && overageBehaviour !== "reject"),
				min_balance: notNullish(maxOverage) ? -maxOverage : undefined,
				max_balance: resetBalance,
				add_to_adjustment: addToAdjustment,
			};
		});

	// Collect and sort rollovers by expires_at (oldest first)
	const sortedRollovers = cusEnts
		.flatMap((ce) => ce.rollovers || [])
		.sort((a, b) => {
			if (a.expires_at && b.expires_at) return a.expires_at - b.expires_at;
			if (a.expires_at && !b.expires_at) return -1;
			if (!a.expires_at && b.expires_at) return 1;
			return 0;
		});

	return {
		customerEntitlements: cusEnts,
		customerEntitlementDeductions,
		rolloverIds: sortedRollovers.map((r) => r.id),
		// cusEnts,
		// cusEntInput,
		// rolloverIds,
		// cusEntIds,
		// unlimited,
		// unlimitedFeatureIds,
	};
};
