import { InternalError } from "@api/errors";
import { formatMs, ms } from "@utils/common";
import type {
	EntityBalance,
	FullCustomerEntitlement,
} from "../../models/cusProductModels/cusEntModels/cusEntModels";
import type { FullCusEntWithFullCusProduct } from "../../models/cusProductModels/cusEntModels/cusEntWithProduct";
import {
	FeatureType,
	FeatureUsageType,
} from "../../models/featureModels/featureEnums";
import { AllowanceType } from "../../models/productModels/entModels/entModels";
import { notNullish, nullish } from "../utils";
import { cusEntToCusPrice } from "./convertCusEntUtils/cusEntToCusPrice";

export const isBooleanCusEnt = ({
	cusEnt,
}: {
	cusEnt: FullCustomerEntitlement;
}) => {
	return cusEnt.entitlement.feature.type === FeatureType.Boolean;
};

export const isUnlimitedCusEnt = (cusEnt: FullCustomerEntitlement) => {
	return cusEnt.entitlement.allowance_type === AllowanceType.Unlimited;
};

/**
 * Type guard that narrows cusEnt to have non-null entities.
 * Use directly with cusEnt (not wrapped in object) for type narrowing to work.
 */
export const isEntityScopedCusEnt = <T extends FullCustomerEntitlement>(
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
	customerEntitlement: FullCusEntWithFullCusProduct,
) => {
	const cusPrice = cusEntToCusPrice({ cusEnt: customerEntitlement });
	return nullish(cusPrice);
};

export const isPaidCustomerEntitlement = (
	customerEntitlement: FullCusEntWithFullCusProduct,
) => {
	const cusPrice = cusEntToCusPrice({ cusEnt: customerEntitlement });
	return notNullish(cusPrice);
};

export const isAllocatedCustomerEntitlement = (
	customerEntitlement: FullCusEntWithFullCusProduct,
) => {
	const feature = customerEntitlement.entitlement.feature;
	const isContinuous =
		feature.config?.usage_type === FeatureUsageType.Continuous;
	if (!isContinuous) return false;

	return true;
};

/**
 *
 * Only applicable for paid customer entitlements
 */
export const customerEntitlementShouldBeBilled = ({
	cusEnt,
	invoicePeriodEndMs,
}: {
	cusEnt: FullCusEntWithFullCusProduct;
	invoicePeriodEndMs: number;
}) => {
	if (!isPaidCustomerEntitlement(cusEnt)) {
		throw new InternalError({
			message: `[customerEntitlementShouldReset] this function is only applicable to paid customer entitlements`,
		});
	}

	const nextResetAt = cusEnt.next_reset_at;
	if (!nextResetAt) return false;

	const TOLERANCE_MS = ms.minutes(30);

	console.log("--------------------------------");
	console.log("nextResetAt", formatMs(nextResetAt));
	console.log("invoicePeriodEndMs", formatMs(invoicePeriodEndMs));

	console.log("--------------------------------");

	return nextResetAt <= invoicePeriodEndMs + TOLERANCE_MS;
};
