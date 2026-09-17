import { Decimal } from "decimal.js";
import type { CreditTier } from "../../../models/featureModels/featureConfig/creditConfig.js";
import { invalidCreditRateCard } from "./invalidCreditRateCard.js";

/** A rate as either a schema row or a rate card carries it: flat credits per feature amount, or graduated tiers. */
export type CreditRate = { feature_amount?: number } & (
	| { credit_amount: number; tier_behavior?: never; tiers?: never }
	| { credit_amount?: never; tier_behavior: "graduated"; tiers: CreditTier[] }
);

const getGraduatedCreditCostAtUsage = ({
	featureId,
	creditSystemId,
	schemaItem,
	usage,
}: {
	featureId: string;
	creditSystemId: string;
	schemaItem: Extract<CreditRate, { tier_behavior: "graduated" }>;
	usage: number;
}) => {
	const featureAmount = schemaItem.feature_amount ?? 1;
	if (!Number.isFinite(featureAmount) || featureAmount <= 0) {
		throw invalidCreditRateCard({
			featureId,
			creditSystemId,
			message: "Credit rate-card billing units must be greater than zero",
		});
	}

	if (schemaItem.tiers.length === 0) {
		throw invalidCreditRateCard({
			featureId,
			creditSystemId,
			message: "Graduated credit rate cards require at least one tier",
		});
	}

	const boundedUsage = Decimal.max(new Decimal(usage), 0);
	let previousBoundary = new Decimal(0);
	let totalCost = new Decimal(0);

	for (const [index, tier] of schemaItem.tiers.entries()) {
		if (!Number.isFinite(tier.credit_amount) || tier.credit_amount < 0) {
			throw invalidCreditRateCard({
				featureId,
				creditSystemId,
				message: "Credit tier costs must be finite and non-negative",
			});
		}

		const isLastTier = index === schemaItem.tiers.length - 1;
		if (tier.to === "inf") {
			if (!isLastTier) {
				throw invalidCreditRateCard({
					featureId,
					creditSystemId,
					message: "Only the final credit tier may have an infinite boundary",
				});
			}

			const tierUnits = Decimal.max(boundedUsage.minus(previousBoundary), 0);
			return totalCost.plus(
				tierUnits.div(featureAmount).mul(tier.credit_amount),
			);
		}

		if (!Number.isFinite(tier.to) || tier.to <= previousBoundary.toNumber()) {
			throw invalidCreditRateCard({
				featureId,
				creditSystemId,
				message: "Credit tier boundaries must be strictly increasing",
			});
		}

		if (isLastTier) {
			throw invalidCreditRateCard({
				featureId,
				creditSystemId,
				message: "The final credit tier must have an infinite boundary",
			});
		}

		const boundary = new Decimal(tier.to);
		const tierUnits = Decimal.max(
			Decimal.min(boundedUsage, boundary).minus(previousBoundary),
			0,
		);
		totalCost = totalCost.plus(
			tierUnits.div(featureAmount).mul(tier.credit_amount),
		);
		previousBoundary = boundary;

		if (boundedUsage.lte(boundary)) return totalCost;
	}

	throw invalidCreditRateCard({
		featureId,
		creditSystemId,
		message: "The final credit tier must have an infinite boundary",
	});
};

/** Credits `amount` units cost at this rate, from `currentUsage` on for graduated tiers. */
export const creditRateToCost = ({
	featureId,
	creditSystemId,
	rate,
	amount,
	currentUsage,
}: {
	featureId: string;
	creditSystemId: string;
	rate: CreditRate;
	amount: number;
	currentUsage: number;
}) => {
	if (rate.tier_behavior === "graduated") {
		const beforeCost = getGraduatedCreditCostAtUsage({
			featureId,
			creditSystemId,
			schemaItem: rate,
			usage: currentUsage,
		});
		const afterCost = getGraduatedCreditCostAtUsage({
			featureId,
			creditSystemId,
			schemaItem: rate,
			usage: Math.max(0, new Decimal(currentUsage).plus(amount).toNumber()),
		});
		return afterCost.minus(beforeCost).toNumber();
	}

	return new Decimal(rate.credit_amount)
		.div(rate.feature_amount ?? 1)
		.mul(amount)
		.toNumber();
};
