import type { DbSpendLimit } from "@models/cusModels/billingControls/spendLimit.js";
import type { FullCustomer } from "@models/cusModels/fullCusModel.js";
import { resolveSpendLimitOverageLimit } from "@utils/cusEntUtils";
import {
	fullCustomerToPlanProducts,
	resolveBillingControl,
} from "../../fullSubjectUtils/planBillingControlUtils.js";
import { fullCustomerToCustomerEntitlements } from "./fullCustomerToCustomerEntitlements";

/**
 * Extract enabled spend limits for the requested features from a FullCustomer.
 *
 * Entity inherits from the customer per feature_id: entity's entry wins when
 * present, customer's entry fills any gaps.
 */
export const fullCustomerToSpendLimitByFeatureId = ({
	fullCustomer,
	featureIds,
	internalEntityId,
}: {
	fullCustomer: FullCustomer;
	featureIds: string[];
	internalEntityId?: string;
}): Record<string, DbSpendLimit> => {
	const entity = internalEntityId
		? fullCustomer.entities?.find(
				(candidate) => candidate.internal_id === internalEntityId,
			)
		: fullCustomer.entity;
	const entitySpendLimits = entity?.spend_limits ?? [];
	const customerSpendLimits = fullCustomer.spend_limits ?? [];
	const spendLimitByFeatureId: Record<string, DbSpendLimit> = {};
	const uniqueFeatureIds = [...new Set(featureIds)];

	for (const featureId of uniqueFeatureIds) {
		const isMatch = (candidate: DbSpendLimit) =>
			candidate.feature_id === featureId &&
			candidate.overage_limit !== undefined;

		// Compute cusEnts up front so percentage-typed plan spend limits can
		// be resolved to absolute units *before* the most-restrictive merge
		// compares them — otherwise e.g. a `200%` cap would lose to a `1000`
		// absolute cap on raw-number comparison even when its resolved value
		// is far higher.
		const cusEnts = fullCustomerToCustomerEntitlements({
			fullCustomer,
			featureIds: [featureId],
			entity,
		});
		const entityIdForResolve = entity?.id ?? entity?.internal_id ?? undefined;
		const normalizeForCompare = (control: DbSpendLimit): DbSpendLimit => {
			if (control.limit_type !== "usage_percentage") return control;
			return {
				...control,
				overage_limit: resolveSpendLimitOverageLimit({
					spendLimit: control,
					cusEnts,
					entityId: entityIdForResolve,
				}),
				limit_type: "absolute",
			};
		};

		const spendLimit = resolveBillingControl<DbSpendLimit, "spend_limits">({
			controlLists: [entitySpendLimits, customerSpendLimits],
			customerProducts: fullCustomerToPlanProducts({ fullCustomer }),
			controlKey: "spend_limits",
			matches: isMatch,
			normalizeForCompare,
		});

		if (spendLimit?.enabled) {
			const resolved = resolveSpendLimitOverageLimit({
				spendLimit,
				cusEnts,
				entityId: entityIdForResolve,
			});

			// Resolve to absolute so Lua deduction reads overage_limit as absolute units.
			if (resolved !== undefined) {
				spendLimitByFeatureId[featureId] = {
					...spendLimit,
					overage_limit: resolved,
					limit_type: "absolute",
				};
			}
		}
	}

	return spendLimitByFeatureId;
};

export const fullCustomerToUsageBasedCusEntsByFeatureId = ({
	fullCustomer,
	featureIds,
	internalEntityId,
}: {
	fullCustomer: FullCustomer;
	featureIds: string[];
	internalEntityId?: string;
}): Record<string, string[]> => {
	const entity = internalEntityId
		? fullCustomer.entities?.find(
				(candidate) => candidate.internal_id === internalEntityId,
			)
		: fullCustomer.entity;

	const cusEnts = fullCustomerToCustomerEntitlements({
		fullCustomer,
		featureIds,
		entity,
	});
	// Every ent for the feature counts toward the overage limit: control-based
	// (overage_allowed) overage has no price, so it isn't pay-per-use.
	const overageCusEntsByFeatureId: Record<string, string[]> = {};

	for (const cusEnt of cusEnts) {
		if (!overageCusEntsByFeatureId[cusEnt.feature_id]) {
			overageCusEntsByFeatureId[cusEnt.feature_id] = [];
		}
		overageCusEntsByFeatureId[cusEnt.feature_id].push(cusEnt.id);
	}

	return overageCusEntsByFeatureId;
};
