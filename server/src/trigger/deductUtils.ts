import { notNullish, nullish } from "@/utils/genUtils.js";
import {
	Feature,
	Event,
	FeatureType,
	FullCustomerEntitlement,
	Entitlement,
} from "@autumn/shared";

import { AggregateType } from "@autumn/shared";
import { Decimal } from "decimal.js";

const DEFAULT_VALUE = 1;

export const getMeteredDeduction = (meteredFeature: Feature, event: Event) => {
	let config = meteredFeature.config;
	let aggregate = config.aggregate;

	if (aggregate.type == AggregateType.Count) {
		return 1;
	}

	let value = notNullish(event.value)
		? event.value
		: notNullish(event.properties?.value)
			? event.properties?.value
			: DEFAULT_VALUE;

	let floatVal = parseFloat(value);
	if (isNaN(floatVal)) {
		return 0;
	}

	if (
		meteredFeature.type == FeatureType.CreditSystem ||
		aggregate.type == AggregateType.Sum
	) {
		return value;
	}

	return 0;
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
	let meteredFeatureIds = meteredFeatures.map((feature) => feature.id);

	for (const schema of creditSystem.config.schema) {
		if (meteredFeatureIds.includes(schema.metered_feature_id)) {
			let meteredFeature = meteredFeatures.find(
				(feature) => feature.id === schema.metered_feature_id,
			);

			if (!meteredFeature) {
				continue;
			}

			let meteredDeduction = getMeteredDeduction(meteredFeature, event);

			let meteredDeductionDecimal = new Decimal(meteredDeduction);
			let featureAmountDecimal = new Decimal(schema.feature_amount);
			let creditAmountDecimal = new Decimal(schema.credit_amount);
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
	allowNegativeBalance = false,
	ent,
	resetBalance,
	blockUsageLimit = true,
}: {
	cusEntBalance: Decimal;
	toDeduct: number;
	allowNegativeBalance?: boolean;
	ent: Entitlement;
	resetBalance: number;
	blockUsageLimit?: boolean;
}) => {
	// Either deduct from balance or entity balance
	if (allowNegativeBalance) {
		let usageLimit = ent.usage_limit;
		let minBalance = usageLimit
			? new Decimal(resetBalance).minus(usageLimit).toNumber()
			: undefined;
		let newBalance = cusEntBalance.minus(toDeduct).toNumber();

		if (
			blockUsageLimit &&
			minBalance &&
			new Decimal(newBalance).lt(minBalance)
		) {
			newBalance = minBalance;
			let deducted = new Decimal(cusEntBalance).minus(minBalance).toNumber();
			let toDeduct_ = new Decimal(toDeduct).minus(deducted).toNumber();
			return { newBalance, deducted, toDeduct: toDeduct_ };
		} else {
			let deducted = toDeduct;
			let toDeduct_ = 0;
			return { newBalance, deducted, toDeduct: toDeduct_ };
		}
	}

	if (cusEntBalance.lte(0) && toDeduct > 0) {
		return { newBalance: cusEntBalance.toNumber(), deducted: 0, toDeduct };
	}

	// If toDeduct is negative, add to balance and set toDeduct to 0
	let newBalance, deducted;
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
