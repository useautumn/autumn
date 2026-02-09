import { Decimal } from "decimal.js";
import type { ApiBalanceBreakdown } from "../../api/customers/cusFeatures/apiBalance.js";
import type { FullCustomerEntitlement } from "../../models/cusProductModels/cusEntModels/cusEntModels.js";
import type { FullCusEntWithFullCusProduct } from "../../models/cusProductModels/cusEntModels/cusEntWithProduct.js";
import { entToOptions } from "../productUtils/convertProductUtils.js";
import { resetIntvToEntIntv } from "../productV2Utils/productItemUtils/convertProductItem/planItemIntervals.js";
import { getCusEntBalance } from "./balanceUtils.js";
import { cusEntToCusPrice } from "./convertCusEntUtils/cusEntToCusPrice.js";
import { getRolloverFields } from "./getRolloverFields.js";
import { getStartingBalance } from "./getStartingBalance.js";

export const cusEntsToPlanId = ({
	cusEnts,
}: {
	cusEnts: FullCusEntWithFullCusProduct[];
}) => {
	// Get number of keys
	const uniquePlanIds = new Set<string>();

	for (const cusEnt of cusEnts) {
		const planId = cusEnt.customer_product?.product?.id;
		if (planId) uniquePlanIds.add(planId);
	}

	if (uniquePlanIds.size > 1) {
		return null;
	}

	return cusEnts[0].customer_product?.product.id ?? null;
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
		return new Decimal(balance).add(rollover.balance).toNumber();
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
	if (!cusEnt.customer_product) return 0;

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
		options: cusProduct?.options ?? [],
	});

	const cusPrice = cusEntToCusPrice({ cusEnt });
	const startingBalance = getStartingBalance({
		entitlement: cusEnt.entitlement,
		options: options || undefined,
		relatedPrice: cusPrice?.price,
		productQuantity: cusProduct?.quantity ?? 1,
	});

	const total = new Decimal(startingBalance).mul(entityCount).toNumber();

	if (withRollovers && rollover) {
		return new Decimal(total)
			.add(rollover.balance)
			.add(rollover.usage)
			.toNumber();
	}

	return total;
};

export const apiBalanceToBreakdownKey = ({
	breakdown,
}: {
	breakdown: ApiBalanceBreakdown;
}) => {
	const inteval =
		breakdown.reset?.interval && breakdown.reset.interval !== "multiple"
			? resetIntvToEntIntv({ resetIntv: breakdown.reset.interval })
			: "lifetime";
	const interval = `${breakdown.reset?.interval_count ?? 1}:${inteval}`;
	const usageModel = `${breakdown.overage_allowed}`;
	const planId = `${breakdown.plan_id}`;

	return `${interval}:${planId}:${usageModel}`;
};
