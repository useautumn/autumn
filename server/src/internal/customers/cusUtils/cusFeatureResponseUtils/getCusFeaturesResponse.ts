import type {
	APIVersion,
	Entity,
	FullCusProduct,
	Organization,
} from "@autumn/shared";
import {
	cusProductsToCusEnts,
	cusProductsToCusPrices,
} from "../../cusProducts/cusProductUtils/convertCusProduct.js";
import { balancesToFeatureResponse } from "./balancesToFeatureResponse.js";
import { getCusBalances } from "./getCusBalances.js";

export const getCusFeaturesResponse = async ({
	cusProducts,
	org,
	entity,
	apiVersion,
}: {
	cusProducts: FullCusProduct[];
	org: Organization;
	entity?: Entity;
	apiVersion: APIVersion;
}) => {
	const cusEnts = cusProductsToCusEnts({ cusProducts }) as any;

	const balances = await getCusBalances({
		cusEntsWithCusProduct: cusEnts,
		cusPrices: cusProductsToCusPrices({
			cusProducts,
		}),
		org,
		entity,
		apiVersion,
	});

	return balancesToFeatureResponse({
		cusEnts,
		balances,
	});
};
