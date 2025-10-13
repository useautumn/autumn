import { Decimal } from "decimal.js";
import {
	entToOptions,
	type FullCusEntWithFullCusProduct,
	type FullCustomerEntitlement,
	getCusEntBalance,
	getStartingBalance,
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

export const cusEntToUsageLimit = ({
	cusEnt,
}: {
	cusEnt: FullCusEntWithFullCusProduct;
}) => {
	const startingBalance = cusEntToIncludedUsage({
		cusEnt,
	});

	if (cusEnt.entitlement.usage_limit) return cusEnt.entitlement.usage_limit;
	return startingBalance;
};
