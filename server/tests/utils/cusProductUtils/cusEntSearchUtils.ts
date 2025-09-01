import type { FullCusProduct, FullCustomerEntitlement } from "@autumn/shared";
import { BillingType, EntInterval } from "@autumn/shared";

import { getRelatedCusPrice } from "@/internal/customers/cusProducts/cusEnts/cusEntUtils.js";
import { getBillingType } from "@/internal/products/prices/priceUtils.js";
import { notNullish } from "@/utils/genUtils.js";

export const getLifetimeFreeCusEnt = ({
	cusProduct,
	featureId,
}: {
	cusProduct: FullCusProduct;
	featureId: string;
}) => {
	// Get lifetime free cus ent
	return cusProduct.customer_entitlements.find(
		(cusEnt: FullCustomerEntitlement) => {
			if (cusEnt.entitlement.feature.id !== featureId) {
				return false;
			}

			const relatedCusPrice = getRelatedCusPrice(
				cusEnt,
				cusProduct.customer_prices,
			);

			if (notNullish(relatedCusPrice)) {
				return false;
			}

			return cusEnt.entitlement.interval === EntInterval.Lifetime;
		},
	);
};
export const getPrepaidCusEnt = ({
	cusProduct,
	featureId,
}: {
	cusProduct: FullCusProduct;
	featureId: string;
}) => {
	// Get prepaid cus ent
	return cusProduct.customer_entitlements.find(
		(cusEnt: FullCustomerEntitlement) => {
			if (cusEnt.entitlement.feature.id !== featureId) {
				return false;
			}

			const relatedCusPrice = getRelatedCusPrice(
				cusEnt,
				cusProduct.customer_prices,
			);

			if (
				relatedCusPrice &&
				getBillingType(relatedCusPrice?.price.config!) ===
					BillingType.UsageInAdvance
			) {
				return true;
			}

			return false;
		},
	);
};

export const getUsageCusEnt = ({
	cusProduct,
	featureId,
}: {
	cusProduct: FullCusProduct;
	featureId: string;
}) => {
	// Get usage cus ent
	return cusProduct.customer_entitlements.find(
		(cusEnt: FullCustomerEntitlement) => {
			if (cusEnt.entitlement.feature.id !== featureId) {
				return false;
			}

			const relatedCusPrice = getRelatedCusPrice(
				cusEnt,
				cusProduct.customer_prices,
			);

			if (
				relatedCusPrice &&
				getBillingType(relatedCusPrice?.price.config!) ===
					BillingType.UsageInArrear
			) {
				return true;
			}

			return false;
		},
	);
};
