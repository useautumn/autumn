import {
	AllowanceType,
	type CreditSchemaItem,
	creditSystemContainsFeature,
	entitlementToCreditSystem,
	ErrCode,
	type Feature,
	FeatureType,
	type FullCusEntWithFullCusProduct,
	RecaseError,
} from "@autumn/shared";
import { logger } from "@/external/logtail/logtailUtils.js";
import {
	type CreditRateCard,
	getCreditCost,
	getCreditRateCard,
} from "@/internal/features/creditSystemUtils.js";
import type { FeatureDeduction } from "../types/featureDeduction.js";

const DEFAULT_CREDIT_COST = 1;

export type ComputedCreditCost = {
	creditCost: number;
	rateCard?: CreditRateCard;
};

export type CreditCostLookup = (entitlementId: string) => ComputedCreditCost;

/** Per-entitlement credit cost lookup. Pure schema math — no I/O. */
export const computeCreditCosts = ({
	cusEnts,
	deduction,
	catalogFeatures,
}: {
	cusEnts: FullCusEntWithFullCusProduct[];
	deduction: FeatureDeduction;
	catalogFeatures?: Feature[];
}): CreditCostLookup => {
	const costMap = new Map<string, ComputedCreditCost>();

	for (const ce of cusEnts) {
		// Token cost is USD: 1:1 on its own ent; parents apply their ratio to it.
		if (
			deduction.tokens &&
			ce.entitlement.feature.id === deduction.feature.id
		) {
			costMap.set(ce.id, { creditCost: deduction.tokens.cost });
			continue;
		}

		// Plan-item feature_override supersedes the catalog config for this cusEnt.
		const creditSystem = entitlementToCreditSystem({
			entitlement: ce.entitlement,
		});

		let rateCard: CreditRateCard | undefined;
		try {
			rateCard = !deduction.tokens
				? getCreditRateCard({
						sourceFeature: deduction.feature,
						creditSystem,
					})
				: undefined;
			if (
				rateCard &&
				(ce.unlimited ||
					ce.entitlement.allowance_type === AllowanceType.Unlimited)
			) {
				throw new RecaseError({
					message:
						"Credit rate cards with unlimited credit balances are not supported yet",
					code: ErrCode.InvalidRequest,
					statusCode: 400,
				});
			}
			const hasAdditionalBalance =
				Math.abs(ce.additional_balance ?? 0) > 0 ||
				Object.values(ce.entities ?? {}).some(
					(entityBalance) =>
						Math.abs(entityBalance.additional_balance ?? 0) > 0,
				);
			if (rateCard && hasAdditionalBalance) {
				throw new RecaseError({
					message:
						"Credit rate cards with additional balances are not supported yet",
					code: ErrCode.InvalidRequest,
					statusCode: 400,
				});
			}

			costMap.set(ce.id, {
				creditCost: getCreditCost({
					featureId: deduction.feature.id,
					creditSystem,
					amount: deduction.tokens?.cost,
				}),
				...(rateCard ? { rateCard } : {}),
			});
		} catch (error) {
			// A configured rate that cannot be evaluated must fail closed. An item
			// override rides the same cached row as the balance, so the staleness
			// fallback below never applies to it — the override is authoritative.
			if (
				rateCard ||
				ce.entitlement.feature_override?.schema ||
				creditSystemContainsFeature({
					creditSystem,
					meteredFeatureId: deduction.feature.id,
				})
			) {
				throw error;
			}

			const currentCreditSystem = catalogFeatures?.find(
				(feature) =>
					feature.internal_id === ce.entitlement.feature.internal_id ||
					feature.id === ce.entitlement.feature.id,
			);
			const currentSchemaItem: CreditSchemaItem | undefined =
				currentCreditSystem?.type === FeatureType.CreditSystem
					? currentCreditSystem.config.schema.find(
							(schemaItem: CreditSchemaItem) =>
								schemaItem.metered_feature_id === deduction.feature.id,
						)
					: undefined;
			if (
				currentCreditSystem &&
				currentSchemaItem &&
				(currentCreditSystem.config.invoice_credit ||
					currentSchemaItem.tier_behavior === "graduated")
			) {
				throw new RecaseError({
					message:
						"Stale credit rate card: refresh the customer balance before tracking usage",
					code: ErrCode.InvalidRequest,
					statusCode: 400,
					data: {
						featureId: deduction.feature.id,
						creditSystemId: currentCreditSystem.id,
						customerEntitlementId: ce.id,
					},
				});
			}

			// Cached cusEnt schemas can briefly trail a feature update; deduct at
			// 1:1 rather than failing the track.
			logger.warn("[computeCreditCosts] falling back to credit cost 1", {
				feature_id: deduction.feature.id,
				credit_system_id: ce.entitlement.feature.id,
				customer_entitlement_id: ce.id,
				error: String(error),
			});
			costMap.set(ce.id, { creditCost: DEFAULT_CREDIT_COST });
		}
	}

	return (entitlementId) =>
		costMap.get(entitlementId) ?? { creditCost: DEFAULT_CREDIT_COST };
};
