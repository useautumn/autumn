import { InternalError } from "@api/errors";
import { getCycleEnd } from "@utils/billingUtils/cycleUtils/getCycleEnd";
import { ms } from "@utils/common";
import {
	isAllocatedPrice,
	isAllocatedV2Price,
	isConsumablePrice,
	isOneOffPrice,
	isPayPerUsePrice,
	isPrepaidPrice,
	isVolumePrice,
} from "@utils/productUtils/priceUtils/classifyPriceUtils";
import type {
	EntityBalance,
	FullCustomerEntitlement,
} from "../../models/cusProductModels/cusEntModels/cusEntModels";
import type { FullCusEntWithFullCusProduct } from "../../models/cusProductModels/cusEntModels/cusEntWithProduct";
import type { FullCustomerPrice } from "../../models/cusProductModels/cusPriceModels/cusPriceModels";
import {
	FeatureType,
	FeatureUsageType,
} from "../../models/featureModels/featureEnums";
import type { Feature } from "../../models/featureModels/featureModels";
import {
	AllowanceType,
	type Entitlement,
} from "../../models/productModels/entModels/entModels";
import type { Price } from "../../models/productModels/priceModels/priceModels";
import { billingAndEntIntervalsDifferent } from "../intervalUtils";
import { notNullish, nullish } from "../utils";
import {
	type CustomerEntitlementWithCustomerPrices,
	cusEntToCusPrice,
} from "./convertCusEntUtils/cusEntToCusPrice";

export const isBooleanCusEnt = ({
	cusEnt,
}: {
	cusEnt: FullCustomerEntitlement;
}) => {
	return cusEnt.entitlement.feature.type === FeatureType.Boolean;
};

export const isUnlimitedCusEnt = (cusEnt: {
	entitlement: Pick<Entitlement, "allowance_type">;
}) => {
	return cusEnt.entitlement.allowance_type === AllowanceType.Unlimited;
};

export const isEntityScopedCusEnt = <
	T extends { entitlement: Pick<Entitlement, "entity_feature_id"> },
>(
	cusEnt: T,
): cusEnt is T & { entities: Record<string, EntityBalance> } => {
	return notNullish(cusEnt.entitlement.entity_feature_id);
};

export const cusEntsHavePrice = ({
	cusEnts,
}: {
	cusEnts: FullCusEntWithFullCusProduct[];
}) => {
	return cusEnts.some((cusEnt) => {
		const cusPrice = cusEntToCusPrice({ cusEnt });
		return notNullish(cusPrice);
	});
};

export const isFreeCustomerEntitlement = (
	customerEntitlement: CustomerEntitlementWithCustomerPrices,
) => {
	const cusPrice = cusEntToCusPrice({ cusEnt: customerEntitlement });
	return nullish(cusPrice);
};

export const isPaidCustomerEntitlement = (
	customerEntitlement: CustomerEntitlementWithCustomerPrices,
) => {
	const cusPrice = cusEntToCusPrice({ cusEnt: customerEntitlement });
	return notNullish(cusPrice);
};

export const isAllocatedCustomerEntitlement = (customerEntitlement: {
	entitlement: { feature: Pick<Feature, "config"> };
}) => {
	const feature = customerEntitlement.entitlement.feature;
	const isContinuous =
		feature.config?.usage_type === FeatureUsageType.Continuous;
	if (!isContinuous) return false;

	return true;
};

export const customerEntitlementAllowsRollovers = (
	customerEntitlement: FullCustomerEntitlement,
) => {
	return notNullish(customerEntitlement.entitlement.rollover);
};

const INVOICE_PERIOD_END_TOLERANCE_MS = ms.days(1);

export const isCustomerEntitlementDueAtInvoice = ({
	customerEntitlement,
	invoicePeriodEndMs,
}: {
	customerEntitlement: Pick<FullCustomerEntitlement, "next_reset_at">;
	invoicePeriodEndMs: number;
}) => {
	return (
		customerEntitlement.next_reset_at !== null &&
		customerEntitlement.next_reset_at <=
			invoicePeriodEndMs + INVOICE_PERIOD_END_TOLERANCE_MS
	);
};

export const customerEntitlementShouldBeBilled = ({
	cusEnt,
	invoicePeriodEndMs,
	billingCycleAnchorMs,
}: {
	cusEnt: FullCusEntWithFullCusProduct;
	invoicePeriodEndMs: number;
	billingCycleAnchorMs?: number;
}) => {
	if (!isPaidCustomerEntitlement(cusEnt)) {
		throw new InternalError({
			message: `[customerEntitlementShouldReset] this function is only applicable to paid customer entitlements`,
		});
	}

	const nextResetAt = cusEnt.next_reset_at;
	if (!nextResetAt) {
		if (!billingCycleAnchorMs) return false;
		if (!isAllocatedV2CustomerEntitlement(cusEnt)) return false;

		const cusPrice = cusEntToCusPrice({ cusEnt });
		if (!cusPrice || !isConsumablePrice(cusPrice.price)) return false;

		const priceConfig = cusPrice.price.config;
		const cycleEnd = getCycleEnd({
			anchor: billingCycleAnchorMs,
			interval: priceConfig.interval,
			intervalCount: priceConfig.interval_count ?? 1,
			now: invoicePeriodEndMs - INVOICE_PERIOD_END_TOLERANCE_MS,
		});

		return (
			Math.abs(cycleEnd - invoicePeriodEndMs) <= INVOICE_PERIOD_END_TOLERANCE_MS
		);
	}

	return isCustomerEntitlementDueAtInvoice({
		customerEntitlement: cusEnt,
		invoicePeriodEndMs,
	});
};

export const isVolumeBasedCusEnt = (cusEnt: FullCusEntWithFullCusProduct) => {
	const cusPrice = cusEntToCusPrice({ cusEnt });
	if (!cusPrice) return false;
	return isVolumePrice(cusPrice.price);
};

export const isUsageBasedAllocatedCustomerEntitlement = (
	cusEnt: FullCusEntWithFullCusProduct,
) => {
	const isAllocated = isAllocatedCustomerEntitlement(cusEnt);

	const cusPrice = cusEntToCusPrice({ cusEnt });
	if (!cusPrice) return false;

	return isAllocated && isAllocatedPrice(cusPrice.price);
};

export const isAllocatedV2CustomerEntitlement = (
	cusEnt: FullCusEntWithFullCusProduct,
) => {
	const isAllocated = isAllocatedCustomerEntitlement(cusEnt);

	const cusPrice = cusEntToCusPrice({ cusEnt });
	if (!cusPrice) return false;

	return isAllocated && isAllocatedV2Price(cusPrice.price);
};

export const isPrepaidCustomerEntitlement = (
	cusEnt: FullCusEntWithFullCusProduct,
) => {
	const cusPrice = cusEntToCusPrice({ cusEnt });
	if (!cusPrice) return false;
	return isPrepaidPrice(cusPrice.price);
};

export const entitlementAndPriceHaveSeparateInterval = ({
	entitlement,
	price,
}: {
	entitlement: Entitlement;
	price?: Price;
}) => {
	if (!price) return false;

	const resetInterval = entitlement.interval;
	const priceInterval = price.config.interval;

	if (!resetInterval || !priceInterval) return false;

	return billingAndEntIntervalsDifferent({
		billingInterval: priceInterval,
		billingIntervalCount: price.config.interval_count,
		entInterval: resetInterval,
		entIntervalCount: entitlement.interval_count,
	});
};

export const customerEntitlementHasDifferentResetAndPriceInterval = ({
	customerEntitlement,
	customerPrice: providedCustomerPrice,
}: {
	customerEntitlement: CustomerEntitlementWithCustomerPrices;
	customerPrice?: FullCustomerPrice;
}) => {
	const customerPrice =
		providedCustomerPrice ?? cusEntToCusPrice({ cusEnt: customerEntitlement });
	if (!customerPrice) return false;

	return entitlementAndPriceHaveSeparateInterval({
		entitlement: customerEntitlement.entitlement,
		price: customerPrice.price,
	});
};

export const isCustomerEntitlementPrepaidWithSeparateResetInterval = ({
	customerEntitlement,
	customerPrice: providedCustomerPrice,
}: {
	customerEntitlement: CustomerEntitlementWithCustomerPrices;
	customerPrice?: FullCustomerPrice;
}) => {
	const customerPrice =
		providedCustomerPrice ?? cusEntToCusPrice({ cusEnt: customerEntitlement });
	if (!customerPrice) return false;
	if (!isPrepaidPrice(customerPrice.price)) return false;

	return customerEntitlementHasDifferentResetAndPriceInterval({
		customerEntitlement,
		customerPrice,
	});
};

export const isPayPerUseCustomerEntitlement = (
	cusEnt: FullCusEntWithFullCusProduct,
) => {
	const cusPrice = cusEntToCusPrice({ cusEnt });
	if (!cusPrice) return false;
	return isPayPerUsePrice({ price: cusPrice.price });
};

export const isOneOffCustomerEntitlement = (
	cusEnt: FullCusEntWithFullCusProduct,
) => {
	const cusPrice = cusEntToCusPrice({ cusEnt });
	if (!cusPrice) return false;
	return isOneOffPrice(cusPrice.price);
};

export const isConsumableCustomerEntitlement = (
	cusEnt: FullCusEntWithFullCusProduct,
) => !isAllocatedCustomerEntitlement(cusEnt);

export const isOneOffPrepaidConsumableCustomerEntitlement = (
	cusEnt: FullCusEntWithFullCusProduct,
) =>
	isPrepaidCustomerEntitlement(cusEnt) &&
	isConsumableCustomerEntitlement(cusEnt) &&
	isOneOffCustomerEntitlement(cusEnt);
