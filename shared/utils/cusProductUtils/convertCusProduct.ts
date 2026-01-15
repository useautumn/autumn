import type { FullCusEntWithFullCusProduct } from "@models/cusProductModels/cusEntModels/cusEntWithProduct.js";
import { sortCusEntsForDeduction } from "@utils/cusEntUtils/sortCusEntsForDeduction.js";
import { isOneOffPrice } from "@utils/productUtils/priceUtils/classifyPriceUtils.js";
import type { FullCustomerPrice } from "../../models/cusProductModels/cusPriceModels/cusPriceModels.js";
import type { CusProductStatus } from "../../models/cusProductModels/cusProductEnums.js";
import type {
	CusProduct,
	FullCusProduct,
} from "../../models/cusProductModels/cusProductModels.js";
import { ProcessorType } from "../../models/genModels/genEnums.js";
import type { BillingType } from "../../models/productModels/priceModels/priceEnums.js";
import type { FullProduct } from "../../models/productModels/productModels.js";
import { getBillingType } from "../productUtils/priceUtils.js";

export const cusProductsToPrices = ({
	cusProducts,
	filters,
}: {
	cusProducts: FullCusProduct[];
	filters?: {
		excludeOneOffPrices?: boolean;
	};
}) => {
	let prices = cusProducts.flatMap((cp) =>
		cusProductToPrices({ cusProduct: cp }),
	);
	if (filters?.excludeOneOffPrices) {
		prices = prices.filter((p) => !isOneOffPrice(p));
	}
	return prices;
};

export const cusProductsToCusPrices = ({
	cusProducts,
	inStatuses,
	billingType,
}: {
	cusProducts: FullCusProduct[];
	inStatuses?: CusProductStatus[];
	billingType?: BillingType;
}) => {
	const cusPrices: FullCustomerPrice[] = [];

	for (const cusProduct of cusProducts) {
		if (inStatuses && !inStatuses.includes(cusProduct.status)) {
			continue;
		}

		let prices = cusProduct.customer_prices;
		if (billingType) {
			prices = prices.filter(
				(cp) => getBillingType(cp.price.config) === billingType,
			);
		}

		cusPrices.push(...prices);
	}

	return cusPrices;
};

export const cusProductsToCusEnts = ({
	cusProducts,
	featureIds,
	internalFeatureIds,
	inStatuses,
}: {
	cusProducts: FullCusProduct[];
	featureIds?: string[];
	internalFeatureIds?: string[];
	inStatuses?: CusProductStatus[];
}) => {
	let cusEnts: FullCusEntWithFullCusProduct[] = [];

	cusProducts = cusProducts.filter((cusProduct) => {
		if (inStatuses) {
			return inStatuses.includes(cusProduct.status);
		}
		return true;
	});

	for (const cusProduct of cusProducts) {
		cusEnts.push(
			...cusProduct.customer_entitlements.map((cusEnt) => ({
				...cusEnt,
				customer_product: cusProduct,
			})),
		);
	}

	if (featureIds) {
		cusEnts = cusEnts.filter((cusEnt) =>
			featureIds.includes(cusEnt.entitlement.feature.id),
		);
	}

	if (internalFeatureIds) {
		cusEnts = cusEnts.filter((cusEnt) =>
			internalFeatureIds.includes(cusEnt.entitlement.internal_feature_id),
		);
	}

	sortCusEntsForDeduction({
		cusEnts,
		reverseOrder: false,
		entityId: undefined,
		customerEntitlementFilters: undefined,
	});

	return cusEnts as FullCusEntWithFullCusProduct[];
};

export const cusProductToPrices = ({
	cusProduct,
	billingType,
}: {
	cusProduct: FullCusProduct;
	billingType?: BillingType;
}) => {
	let prices = cusProduct.customer_prices.map((cp) => cp.price);

	if (billingType) {
		prices = prices.filter((p) => getBillingType(p.config) === billingType);
	}

	return prices;
};

export const cusProductToEnts = ({
	cusProduct,
}: {
	cusProduct: FullCusProduct;
}) => {
	return cusProduct.customer_entitlements.map((ce) => ce.entitlement);
};

export const cusProductToProduct = ({
	cusProduct,
}: {
	cusProduct: FullCusProduct;
}) => {
	return {
		...cusProduct.product,
		prices: cusProductToPrices({ cusProduct }),
		entitlements: cusProductToEnts({ cusProduct }),
		free_trial: cusProduct.free_trial,
	} as FullProduct;
};

export const cusProductToCusEnts = ({
	customerProduct,
}: {
	customerProduct: FullCusProduct;
}): FullCusEntWithFullCusProduct[] => {
	return customerProduct.customer_entitlements.map((cusEnt) => ({
		...cusEnt,
		customer_product: customerProduct,
	}));
};

export const cusProductToProcessorType = (cusProduct: CusProduct) => {
	return cusProduct.processor?.type ?? ProcessorType.Stripe;
};
