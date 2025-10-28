import type { Entitlement, Event, Feature } from "@autumn/shared";
import { Decimal } from "decimal.js";
import { notNullish } from "@/utils/genUtils.js";

const DEFAULT_VALUE = 1;

export const getMeteredDeduction = (meteredFeature: Feature, event: Event) => {
	// const config = meteredFeature.config;
	// const aggregate = config.aggregate;

	// if (aggregate.type === AggregateType.Count) {
	// 	return 1;
	// }

	const value = notNullish(event.value)
		? event.value
		: notNullish(event.properties?.value)
			? event.properties?.value
			: DEFAULT_VALUE;

	const floatVal = parseFloat(value);
	if (Number.isNaN(floatVal)) return 0;

	return value;
	// if (
	// 	meteredFeature.type === FeatureType.CreditSystem ||
	// 	aggregate.type === AggregateType.Sum
	// ) {
	// 	return value;
	// }

	// return 0;
};

export const getCreditSystemDeduction = ({
	meteredFeatures,
	creditSystem,
	event,
}: {
	meteredFeatures: Feature[];
	creditSystem: Feature;
	event: Event;
}) => {
	let creditsUpdate = 0;
	const meteredFeatureIds = meteredFeatures.map((feature) => feature.id);

	for (const schema of creditSystem.config.schema) {
		if (meteredFeatureIds.includes(schema.metered_feature_id)) {
			const meteredFeature = meteredFeatures.find(
				(feature) => feature.id === schema.metered_feature_id,
			);

			if (!meteredFeature) {
				continue;
			}

			const meteredDeduction = getMeteredDeduction(meteredFeature, event);

			const meteredDeductionDecimal = new Decimal(meteredDeduction);
			const featureAmountDecimal = new Decimal(schema.feature_amount);
			const creditAmountDecimal = new Decimal(schema.credit_amount);
			creditsUpdate += meteredDeductionDecimal
				.div(featureAmountDecimal)
				.mul(creditAmountDecimal)
				.toNumber();
		}
	}

	return creditsUpdate;
};

// Deduct allowance
export const performDeduction = ({
	cusEntBalance,
	toDeduct,
	ent,
	resetBalance,
	blockUsageLimit = true,
	allowNegativeBalance = false,
}: {
	cusEntBalance: Decimal;
	toDeduct: number;
	ent: Entitlement;
	resetBalance: number;
	blockUsageLimit?: boolean;
	allowNegativeBalance?: boolean;
}) => {
	// Either deduct from balance or entity balance
	if (allowNegativeBalance) {
		const usageLimit = ent.usage_limit;
		const minBalance = usageLimit
			? new Decimal(resetBalance).minus(usageLimit).toNumber()
			: undefined;

		let newBalance = cusEntBalance.minus(toDeduct).toNumber();

		if (
			blockUsageLimit &&
			minBalance &&
			new Decimal(newBalance).lt(minBalance)
		) {
			newBalance = minBalance;
			const deducted = new Decimal(cusEntBalance).minus(minBalance).toNumber();
			const toDeduct_ = new Decimal(toDeduct).minus(deducted).toNumber();
			return { newBalance, deducted, toDeduct: toDeduct_ };
		} else {
			const deducted = toDeduct;
			const toDeduct_ = 0;
			return { newBalance, deducted, toDeduct: toDeduct_ };
		}
	}

	if (cusEntBalance.lte(0) && toDeduct > 0) {
		return { newBalance: cusEntBalance.toNumber(), deducted: 0, toDeduct };
	}

	// If toDeduct is negative, add to balance and set toDeduct to 0
	let newBalance: number;
	let deducted: number;
	if (toDeduct < 0) {
		newBalance = cusEntBalance.minus(toDeduct).toNumber();
		deducted = toDeduct;
		toDeduct = 0;
	}

	// If cusEnt has less balance to deduct than 0, deduct the balance and set balance to 0
	else if (cusEntBalance.minus(toDeduct).lt(0)) {
		toDeduct = new Decimal(toDeduct).minus(cusEntBalance).toNumber(); // toDeduct = toDeduct - cusEntBalance
		deducted = cusEntBalance.toNumber(); // deducted = cusEntBalance
		newBalance = 0; // newBalance = 0
	} else {
		newBalance = cusEntBalance.minus(toDeduct).toNumber();
		deducted = toDeduct;
		toDeduct = 0;
	}

	return { newBalance, deducted, toDeduct };
};
