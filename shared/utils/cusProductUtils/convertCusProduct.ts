import type { Entity } from "../../models/cusModels/entityModels/entityModels.js";
import type { FullCusEntWithFullCusProduct } from "../../models/cusProductModels/cusEntModels/cusEntWithProduct.js";
import type { FullCustomerPrice } from "../../models/cusProductModels/cusPriceModels/cusPriceModels.js";
import { CusProductStatus } from "../../models/cusProductModels/cusProductEnums.js";
import type { FullCusProduct } from "../../models/cusProductModels/cusProductModels.js";
import type { BillingType } from "../../models/productModels/priceModels/priceEnums.js";
import type { FullProduct } from "../../models/productModels/productModels.js";
import { cusEntMatchesEntity } from "../cusEntUtils/cusEntUtils.js";
import { sortCusEntsForDeduction } from "../cusEntUtils/sortCusEntsForDeduction.js";
import { getBillingType } from "../productUtils/priceUtils.js";

export const cusProductsToPrices = ({
	cusProducts,
}: {
	cusProducts: FullCusProduct[];
}) => {
	return cusProducts.flatMap((cp) => cusProductToPrices({ cusProduct: cp }));
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
	inStatuses = [CusProductStatus.Active],
	reverseOrder = false,
	featureId,
	featureIds,
	entity,
}: {
	cusProducts: FullCusProduct[];
	inStatuses?: CusProductStatus[];
	reverseOrder?: boolean;
	featureId?: string;
	featureIds?: string[];
	entity?: Entity;
}) => {
	let cusEnts: FullCusEntWithFullCusProduct[] = [];

	for (const cusProduct of cusProducts) {
		if (!inStatuses.includes(cusProduct.status)) {
			continue;
		}

		cusEnts.push(
			...cusProduct.customer_entitlements.map((cusEnt) => ({
				...cusEnt,
				customer_product: cusProduct,
			})),
		);
	}

	if (featureId) {
		cusEnts = cusEnts.filter(
			(cusEnt) => cusEnt.entitlement.feature_id === featureId,
		);
	}

	if (featureIds) {
		cusEnts = cusEnts.filter((cusEnt) =>
			featureIds.includes(cusEnt.entitlement.feature.id),
		);
	}

	if (entity) {
		cusEnts = cusEnts.filter((cusEnt) =>
			cusEntMatchesEntity({
				cusEnt: cusEnt,
				entity,
			}),
		);
	}

	sortCusEntsForDeduction(cusEnts, reverseOrder);

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
