import {
	type ApiVersionClass,
	cusProductsToCusEnts,
	cusProductsToCusPrices,
	type Entity,
	type FullCusProduct,
	type Organization,
} from "@autumn/shared";
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
	apiVersion: ApiVersionClass;
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
