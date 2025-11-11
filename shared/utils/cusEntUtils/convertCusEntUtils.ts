import { Decimal } from "decimal.js";
import {
	entToOptions,
	type FullCusEntWithFullCusProduct,
	type FullCustomerEntitlement,
	getCusEntBalance,
	getStartingBalance,
	notNullish,
} from "../../index.js";
import { cusEntToCusPrice } from "../productUtils/convertUtils.js";
import { getRolloverFields } from "./getRolloverFields.js";

export const cusEntToKey = ({
	cusEnt,
}: {
	cusEnt: FullCustomerEntitlement;
}) => {
	const ent = cusEnt.entitlement;
	return `${ent.interval || "null"}-${ent.interval_count || 1}-${ent.feature.id}`;
};

export const cusEntToBalance = ({
	cusEnt,
	entityId,
	withRollovers = false,
}: {
	cusEnt: FullCustomerEntitlement;
	entityId?: string;
	withRollovers?: boolean;
}) => {
	const { balance } = getCusEntBalance({
		cusEnt,
		entityId,
	});

	const rollover = getRolloverFields({
		cusEnt,
		entityId,
	});

	if (withRollovers && rollover) {
		return balance + rollover.balance;
	}

	return balance;
};

export const cusEntToIncludedUsage = ({
	cusEnt,
	entityId,
	withRollovers = false,
}: {
	cusEnt: FullCusEntWithFullCusProduct;
	entityId?: string;
	withRollovers?: boolean;
}) => {
	const rollover = getRolloverFields({
		cusEnt,
		entityId,
	});

	const { count: entityCount } = getCusEntBalance({
		cusEnt,
		entityId,
	});

	const cusProduct = cusEnt.customer_product;
	const options = entToOptions({
		ent: cusEnt.entitlement,
		options: cusProduct.options,
	});

	const cusPrice = cusEntToCusPrice({ cusEnt });
	const startingBalance = getStartingBalance({
		entitlement: cusEnt.entitlement,
		options: options || undefined,
		relatedPrice: cusPrice?.price,
		productQuantity: cusProduct.quantity || 1,
	});

	const total = new Decimal(startingBalance).mul(entityCount).toNumber();

	if (withRollovers && rollover) {
		return total + rollover.balance + rollover.usage;
	}

	return total;

	// if (rollover) {
	// 	total = new Decimal(total)
	// 		.add(rollover.balance)
	// 		.add(rollover.usage)
	// 		.toNumber();
	// }
};

export const cusEntToMaxPurchase = ({
	cusEnt,
	entityId,
}: {
	cusEnt: FullCusEntWithFullCusProduct;
	entityId?: string;
}) => {
	const startingBalance = cusEntToIncludedUsage({
		cusEnt,
		entityId,
	});

	const usageLimit = cusEnt.entitlement.usage_limit;
	// if (cusEnt.entitlement.usage_limit) return cusEnt.entitlement.usage_limit;
	// return startingBalance;

	if (notNullish(usageLimit) && notNullish(startingBalance)) {
		return new Decimal(usageLimit).sub(startingBalance).toNumber();
	}

	return 0;
};

// NEW CUS ENT UTILS
export const cusEntToGrantedBalance = ({
	cusEnt,
	entityId,
	withRollovers = false,
}: {
	cusEnt: FullCusEntWithFullCusProduct;
	entityId?: string;
	withRollovers?: boolean;
}) => {
	const rollover = getRolloverFields({
		cusEnt,
		entityId,
	});

	const { count: entityCount } = getCusEntBalance({
		cusEnt,
		entityId,
	});

	const grantedBalance = cusEnt.entitlement.allowance || 0;

	const total = new Decimal(grantedBalance).mul(entityCount).toNumber();

	if (withRollovers && rollover) {
		return new Decimal(total)
			.add(rollover.balance)
			.add(rollover.usage)
			.toNumber();
	}

	return total;
};
